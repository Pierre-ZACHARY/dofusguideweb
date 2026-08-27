import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { normalizeName } from "../normalizer/names.js";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import type { QuestGuideContent } from "./types.js";

const itemPageSchema = z.object({
  data: z.array(z.object({
    id: z.number().int().positive(),
    iconId: z.number().int().positive().optional(),
    img: z.string().url().optional(),
    name: z.object({ fr: z.string().min(1) }),
  })),
});

class DofusDbHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super("GET " + url + " returned HTTP " + status);
  }
}

export interface ResolveDofusDbItemsOptions {
  itemFetch?: typeof fetch;
  dofusDbBaseUrl?: string;
  publicItemDirectory?: string;
  itemDelayMs?: number;
  metadataOnly?: boolean;
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function request(url: string, requestFetch: typeof fetch): Promise<Response> {
  return retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await requestFetch(url, {
        headers: { accept: "application/json,image/*", "user-agent": "DofusGuideScraper/0.1.0 (local quest item resolver)" },
        signal: controller.signal,
      });
      if (!response.ok) throw new DofusDbHttpError(response.status, url);
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    maxRetries: 3,
    shouldRetry: (error) => !(error instanceof DofusDbHttpError) || error.status === 408 || error.status === 429 || error.status >= 500,
  });
}

export async function resolveQuestGuideItems(
  content: QuestGuideContent,
  options: ResolveDofusDbItemsOptions = {},
): Promise<QuestGuideContent> {
  const requestFetch = options.itemFetch ?? fetch;
  const baseUrl = options.dofusDbBaseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? "https://api.dofusdb.fr";
  const imageDirectory = path.resolve(options.publicItemDirectory ?? "public/items");
  const resolved = [];

  for (const [index, item] of content.items.entries()) {
    const completeMetadata = item.itemId !== null && item.imageUrl !== null && item.dofusDbUrl !== null;
    const expectedLocalImage = item.itemId === null ? null : path.join(imageDirectory, item.itemId + ".png");
    if (completeMetadata && (options.metadataOnly || expectedLocalImage === null || await exists(expectedLocalImage))) {
      resolved.push(item);
      continue;
    }
    try {
      const queries = [...new Set([item.name, item.name.replace(/[’‘]/gu, "'")])];
      const candidates = [];
      for (const query of queries) {
        const url = new URL("/items", baseUrl);
        url.searchParams.set("$limit", "10");
        url.searchParams.set("name.fr", query);
        const page = itemPageSchema.parse(await (await request(url.toString(), requestFetch)).json());
        candidates.push(...page.data);
        if (page.data.length > 0) break;
      }
      const match = candidates
        .filter((candidate) => normalizeName(candidate.name.fr) === normalizeName(item.name))
        .sort((left, right) => right.id - left.id)[0];
      if (match === undefined) {
        console.warn("[dofusdb] no exact item match for " + item.name);
        resolved.push(item);
      } else {
        const imageUrl = "/items/" + match.id + ".png";
        if (!options.metadataOnly) {
          const target = path.join(imageDirectory, match.id + ".png");
          if (!await exists(target)) {
            const remoteImage = match.img ?? new URL("/img/items/" + (match.iconId ?? match.id) + ".png", baseUrl).toString();
            const imageResponse = await request(remoteImage, requestFetch);
            if ((imageResponse.headers.get("content-type") ?? "").startsWith("image/")) {
              await atomicWriteFile(target, Buffer.from(await imageResponse.arrayBuffer()));
            }
          }
        }
        resolved.push({ name: match.name.fr, itemId: match.id, imageUrl, dofusDbUrl: "https://dofusdb.fr/fr/database/item/" + match.id });
      }
    } catch (error) {
      console.warn("[dofusdb] item resolution failed for " + item.name + ": " + String(error));
      resolved.push(item);
    }
    if (index + 1 < content.items.length) await sleep(options.itemDelayMs ?? 100);
  }

  return { ...content, items: resolved };
}
