import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import type { ExtractedQuestArticle } from "./extractDplnArticle.js";

export function canonicalSourceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function sourceArticleCachePath(cacheDirectory: string, sourceUrl: string): string {
  return path.join(cacheDirectory, createHash("sha256").update(sourceUrl).digest("hex") + ".json");
}

function isArticle(value: unknown): value is ExtractedQuestArticle {
  if (typeof value !== "object" || value === null) return false;
  const article = value as Record<string, unknown>;
  return typeof article.sourceUrl === "string"
    && typeof article.title === "string"
    && typeof article.content === "string"
    && typeof article.sourceHash === "string";
}

export async function loadCachedSourceArticle(cacheDirectory: string, sourceUrl: string): Promise<ExtractedQuestArticle | null> {
  const canonicalUrl = canonicalSourceUrl(sourceUrl);
  try {
    const parsed: unknown = JSON.parse(await readFile(sourceArticleCachePath(cacheDirectory, canonicalUrl), "utf8"));
    return isArticle(parsed) && canonicalSourceUrl(parsed.sourceUrl) === canonicalUrl ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function cacheSourceArticle(cacheDirectory: string, article: ExtractedQuestArticle): Promise<void> {
  await atomicWriteFile(
    sourceArticleCachePath(cacheDirectory, canonicalSourceUrl(article.sourceUrl)),
    Buffer.from(JSON.stringify(article, null, 2) + "\n", "utf8"),
  );
}
