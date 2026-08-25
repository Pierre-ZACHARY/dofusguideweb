import { access } from "node:fs/promises";
import path from "node:path";
import { dofusDbChallengePageSchema, type DofusDbChallenge, type DofusDbChallengeArchive } from "./types.js";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";

const DEFAULT_BASE_URL = "https://api.dofusdb.fr";
const USER_AGENT = "DofusGuideScraper/0.1.0 (local DofusDB challenge archival client)";

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
    onRetry: (error, retryNumber, delayMs) => console.warn("[dofusdb] " + String(error) + "; retry " + retryNumber + " in " + delayMs + " ms"),
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

function imageFileName(challenge: DofusDbChallenge): string {
  const id = challenge.iconId ?? challenge.id;
  return String(id) + ".png";
}

export interface ScrapeChallengeOptions {
  baseUrl?: string;
  outputPath?: string;
  publicImageDirectory?: string;
  pageDelayMs?: number;
  imageDelayMs?: number;
  metadataOnly?: boolean;
  force?: boolean;
}

export async function scrapeDofusDbChallenges(options: ScrapeChallengeOptions = {}): Promise<DofusDbChallengeArchive> {
  const baseUrl = options.baseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? DEFAULT_BASE_URL;
  const outputPath = options.outputPath ?? "data/dofusdb/challenges.json";
  const imageDirectory = options.publicImageDirectory ?? "public/challenges";
  const pageDelayMs = options.pageDelayMs ?? 250;
  const imageDelayMs = options.imageDelayMs ?? 25;
  // DofusDB caps this collection at 50 records even when a larger limit is requested.
  // Keeping the requested stride equal to that cap avoids skipping every other page.
  const pageSize = 50;
  const challenges: DofusDbChallenge[] = [];
  let total = Number.POSITIVE_INFINITY;

  for (let skip = 0; skip < total; skip += pageSize) {
    const url = new URL("/challenges", baseUrl);
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$sort[id]", "1");
    const response = await request(url.toString());
    const page = dofusDbChallengePageSchema.parse(await response.json());
    total = page.total;
    challenges.push(...page.data);
    console.info("[dofusdb] challenges " + challenges.length + "/" + total);
    if (challenges.length < total) await sleep(pageDelayMs);
  }

  const archive: DofusDbChallengeArchive = {
    source: new URL("/challenges", baseUrl).toString(),
    scrapedAt: new Date().toISOString(),
    total: challenges.length,
    challenges,
  };
  await atomicWriteFile(path.resolve(outputPath), Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));

  if (!options.metadataOnly) {
    const uniqueImages = new Map<string, { url: string; challenge: DofusDbChallenge }>();
    for (const challenge of challenges) {
      const imageUrl = challenge.img ?? new URL("/img/challenges/" + imageFileName(challenge), baseUrl).toString();
      uniqueImages.set(imageFileName(challenge), { url: imageUrl, challenge });
    }

    let downloaded = 0;
    for (const [fileName, image] of uniqueImages) {
      const target = path.resolve(imageDirectory, fileName);
      if (!options.force && await exists(target)) {
        downloaded += 1;
        continue;
      }
      const response = await request(image.url);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        console.warn("[dofusdb] ignored non-image response for challenge " + image.challenge.id);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) continue;
      await atomicWriteFile(target, bytes);
      downloaded += 1;
      if (downloaded % 50 === 0 || downloaded === uniqueImages.size) {
        console.info("[dofusdb] images " + downloaded + "/" + uniqueImages.size);
      }
      await sleep(imageDelayMs);
    }
  }

  console.info("[dofusdb] archive saved to " + path.resolve(outputPath));
  return archive;
}
