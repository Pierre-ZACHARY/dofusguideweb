import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import { preserveScrapedAtIfUnchanged } from "../utils/stableArchive.js";
import { buildBestiaryCatalog } from "./buildCatalog.js";
import { dofusDbPageSchema, type BestiaryCatalog } from "./types.js";

const DEFAULT_BASE_URL = "https://api.dofusdb.fr";
const USER_AGENT = "DofusGuideScraper/0.1.0 (local DofusDB bestiary archival client)";
type RawRecord = Record<string, unknown>;

class HttpStatusError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super("GET " + url + " returned HTTP " + status);
  }
}

async function request(url: string, timeoutMs: number): Promise<Response> {
  return retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: controller.signal });
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

async function fetchCollection(baseUrl: string, endpoint: string, pageSize: number, delayMs: number, timeoutMs: number): Promise<RawRecord[]> {
  const records: RawRecord[] = [];
  let total = Number.POSITIVE_INFINITY;
  let skip = 0;
  while (skip < total) {
    const url = new URL(endpoint, baseUrl);
    url.searchParams.set("$limit", String(pageSize));
    url.searchParams.set("$skip", String(skip));
    url.searchParams.set("$sort[id]", "1");
    const page = dofusDbPageSchema.parse(await (await request(url.toString(), timeoutMs)).json());
    total = page.total;
    if (page.data.length === 0) throw new Error("DofusDB returned an empty page for " + endpoint + " at offset " + skip + "/" + total);
    records.push(...page.data);
    skip += page.data.length;
    console.info("[dofusdb] " + endpoint.slice(1) + " " + Math.min(records.length, total) + "/" + total);
    if (skip < total) await sleep(delayMs);
  }
  return records;
}

async function writeRaw(outputDirectory: string, endpoint: string, source: string, scrapedAt: string, records: RawRecord[]): Promise<void> {
  const outputPath = path.resolve(outputDirectory, "raw", endpoint + ".json");
  const archive = await preserveScrapedAtIfUnchanged(outputPath, { source, scrapedAt, total: records.length, data: records });
  await atomicWriteFile(outputPath, Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));
}

export interface ScrapeBestiaryOptions {
  baseUrl?: string;
  outputDirectory?: string;
  pageSize?: number;
  pageDelayMs?: number;
  timeoutMs?: number;
}

export async function scrapeDofusDbBestiary(options: ScrapeBestiaryOptions = {}): Promise<BestiaryCatalog> {
  const baseUrl = options.baseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? DEFAULT_BASE_URL;
  const outputDirectory = options.outputDirectory ?? "data/dofusdb";
  const pageSize = options.pageSize ?? 50;
  const delayMs = options.pageDelayMs ?? 200;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const scrapedAt = new Date().toISOString();
  const endpoints = ["monsters", "dungeons", "achievements", "subareas", "map-positions"] as const;
  const collections = new Map<string, RawRecord[]>();
  for (const endpoint of endpoints) {
    const records = await fetchCollection(baseUrl, "/" + endpoint, pageSize, delayMs, timeoutMs);
    collections.set(endpoint, records);
    await writeRaw(outputDirectory, endpoint, new URL("/" + endpoint, baseUrl).toString(), scrapedAt, records);
  }
  const catalogPath = path.resolve(outputDirectory, "bestiary.json");
  const catalog = await preserveScrapedAtIfUnchanged<BestiaryCatalog>(catalogPath, buildBestiaryCatalog({
    source: baseUrl,
    scrapedAt,
    monsters: collections.get("monsters") ?? [],
    dungeons: collections.get("dungeons") ?? [],
    achievements: collections.get("achievements") ?? [],
    subareas: collections.get("subareas") ?? [],
    mapPositions: collections.get("map-positions") ?? [],
  }));
  await atomicWriteFile(catalogPath, Buffer.from(JSON.stringify(catalog, null, 2) + "\n", "utf8"));
  console.info("[dofusdb] bestiary catalog saved: " + catalog.monsters.length + " monsters, " + catalog.dungeons.length + " dungeons, " + catalog.achievements.length + " monster achievements");
  return catalog;
}
