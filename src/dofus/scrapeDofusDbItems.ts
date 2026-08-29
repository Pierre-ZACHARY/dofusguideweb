import { access } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import { preserveScrapedAtIfUnchanged } from "../utils/stableArchive.js";
import { dofusDbItemPageSchema, type DofusDbItemArchive } from "./types.js";

const DEFAULT_BASE_URL = "https://api.dofusdb.fr";
const USER_AGENT = "DofusGuideScraper/0.1.0 (local DofusDB Dofus archival client)";

class HttpStatusError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super("GET " + url + " returned HTTP " + status);
  }
}

async function request(url: string): Promise<Response> {
  return retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json,image/*", "user-agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) throw new HttpStatusError(response.status, url);
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    maxRetries: 3,
    shouldRetry: (error) => !(error instanceof HttpStatusError) || error.status === 408 || error.status === 429 || error.status >= 500,
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface ScrapeDofusOptions {
  baseUrl?: string;
  outputPath?: string;
  publicImageDirectory?: string;
  imageDelayMs?: number;
  metadataOnly?: boolean;
  force?: boolean;
}

export async function scrapeDofusDbItems(options: ScrapeDofusOptions = {}): Promise<DofusDbItemArchive> {
  const baseUrl = options.baseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? DEFAULT_BASE_URL;
  const outputPath = options.outputPath ?? "data/dofusdb/dofus.json";
  const imageDirectory = options.publicImageDirectory ?? "public/dofus";
  const url = new URL("/items", baseUrl);
  url.searchParams.set("$limit", "50");
  url.searchParams.set("$skip", "0");
  url.searchParams.set("$sort[id]", "-1");
  url.searchParams.set("typeId", "23");
  const response = await request(url.toString());
  const page = dofusDbItemPageSchema.parse(await response.json());
  const items = page.data.filter((item) => item.typeId === 23).sort((left, right) => right.id - left.id);
  const archive = await preserveScrapedAtIfUnchanged<DofusDbItemArchive>(outputPath, {
    source: url.toString(),
    scrapedAt: new Date().toISOString(),
    total: items.length,
    items,
  });
  await atomicWriteFile(path.resolve(outputPath), Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));

  if (!options.metadataOnly) {
    let downloaded = 0;
    for (const item of items) {
      if (!item.img) continue;
      const target = path.resolve(imageDirectory, String(item.id) + ".png");
      if (!options.force && await exists(target)) {
        downloaded += 1;
        continue;
      }
      const imageResponse = await request(item.img);
      if (!(imageResponse.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      if (bytes.length === 0) continue;
      await atomicWriteFile(target, bytes);
      downloaded += 1;
      await sleep(options.imageDelayMs ?? 50);
    }
    console.info("[dofusdb] Dofus images " + downloaded + "/" + items.length);
  }
  console.info("[dofusdb] Dofus archive saved to " + path.resolve(outputPath));
  return archive;
}
