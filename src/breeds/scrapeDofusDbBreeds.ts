import { access } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import { preserveScrapedAtIfUnchanged } from "../utils/stableArchive.js";
import { dofusDbBreedPageSchema, type DofusDbBreed, type DofusDbBreedArchive } from "./types.js";

const DEFAULT_BASE_URL = "https://api.dofusdb.fr";
const DEFAULT_RENDERER_BASE_URL = "https://renderer.dofusdb.fr";
const USER_AGENT = "DofusGuideScraper/0.1.0 (local DofusDB breed archival client)";

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

async function requestImage(url: string): Promise<Response | null> {
  try {
    return await request(url);
  } catch (error) {
    if (error instanceof HttpStatusError && (error.status === 404 || error.status === 410)) {
      console.warn("[dofusdb] unavailable image skipped: " + url);
      return null;
    }
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface ScrapeBreedOptions {
  baseUrl?: string;
  rendererBaseUrl?: string;
  outputPath?: string;
  publicImageDirectory?: string;
  profileAvatarDirectory?: string;
  imageDelayMs?: number;
  metadataOnly?: boolean;
  force?: boolean;
}

export function encodeDofusDbLook(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

export function buildDofusDbProfileRendererUrl(
  rendererBaseUrl: string,
  lookToken: string,
  gender: "male" | "female",
): string {
  const direction = gender === "male" ? 1 : 3;
  return new URL("/kool/" + encodeDofusDbLook(lookToken) + "/full/" + direction + "/300_300.png", rendererBaseUrl).toString();
}

async function getProfileLookToken(baseUrl: string, breedId: number, gender: "male" | "female"): Promise<string> {
  const lookUrl = new URL("/look", baseUrl);
  lookUrl.searchParams.set("breedId", String(breedId));
  lookUrl.searchParams.set("sexe", gender === "male" ? "m" : "f");
  const response = await request(lookUrl.toString());
  const value: unknown = await response.json();
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Unexpected DofusDB look payload for breed " + breedId + " (" + gender + ")");
  }
  return value;
}

export async function scrapeDofusDbBreeds(options: ScrapeBreedOptions = {}): Promise<DofusDbBreedArchive> {
  const baseUrl = options.baseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? DEFAULT_BASE_URL;
  const rendererBaseUrl = options.rendererBaseUrl ?? process.env.DOFUSDB_RENDERER_BASE_URL ?? DEFAULT_RENDERER_BASE_URL;
  const outputPath = options.outputPath ?? "data/dofusdb/breeds.json";
  const imageDirectory = options.publicImageDirectory ?? "public/breeds";
  const avatarDirectory = options.profileAvatarDirectory ?? "public/profile-avatars";
  const url = new URL("/breeds", baseUrl);
  url.searchParams.set("$limit", "50");
  url.searchParams.set("$skip", "0");
  const response = await request(url.toString());
  const page = dofusDbBreedPageSchema.parse(await response.json());
  const breeds = [...page.data].sort((left, right) => left.id - right.id);
  const archive = await preserveScrapedAtIfUnchanged<DofusDbBreedArchive>(outputPath, {
    source: new URL("/breeds", baseUrl).toString(),
    scrapedAt: new Date().toISOString(),
    total: breeds.length,
    breeds,
  });
  await atomicWriteFile(path.resolve(outputPath), Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));

  if (!options.metadataOnly) {
    let downloaded = 0;
    let avatarDownloaded = 0;
    for (const breed of breeds) {
      if (breed.img) {
        const target = path.resolve(imageDirectory, String(breed.id) + ".png");
        if (!options.force && await exists(target)) {
          downloaded += 1;
        } else {
          const imageResponse = await requestImage(breed.img);
          if (imageResponse && (imageResponse.headers.get("content-type") ?? "").startsWith("image/")) {
            const bytes = Buffer.from(await imageResponse.arrayBuffer());
            if (bytes.length > 0) {
              await atomicWriteFile(target, bytes);
              downloaded += 1;
              await sleep(options.imageDelayMs ?? 50);
            }
          }
        }
      }

      for (const gender of ["male", "female"] as const) {
        const avatarTarget = path.resolve(avatarDirectory, breed.id + "-" + gender + "-full.png");
        if (!options.force && await exists(avatarTarget)) {
          avatarDownloaded += 1;
          continue;
        }
        const lookToken = await getProfileLookToken(baseUrl, breed.id, gender);
        const avatarUrl = buildDofusDbProfileRendererUrl(rendererBaseUrl, lookToken, gender);
        const avatarResponse = await requestImage(avatarUrl);
        if (!avatarResponse || !(avatarResponse.headers.get("content-type") ?? "").startsWith("image/")) continue;
        const avatarBytes = Buffer.from(await avatarResponse.arrayBuffer());
        if (avatarBytes.length === 0) continue;
        await atomicWriteFile(avatarTarget, avatarBytes);
        avatarDownloaded += 1;
        await sleep(options.imageDelayMs ?? 50);
      }
    }
    console.info("[dofusdb] breed images " + downloaded + "/" + breeds.length);
    console.info("[dofusdb] profile avatars " + avatarDownloaded + "/" + (breeds.length * 2));
  }
  console.info("[dofusdb] breeds archive saved to " + path.resolve(outputPath));
  return archive;
}
