import { access } from "node:fs/promises";
import path from "node:path";
import { normalizeName } from "../normalizer/names.js";
import type { GuideStepRecord } from "../repositories/contracts.js";
import { atomicWriteFile } from "../utils/fs.js";
import type { QuestGuideContent } from "./types.js";

interface KnownStepItem {
  id: number;
  name: string;
  remoteImageUrl: string | null;
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

export function knownGuideStepItems(step: GuideStepRecord): Map<string, KnownStepItem> {
  const items = new Map<string, KnownStepItem>();
  for (const element of step.elements) {
    if (element.elementType !== "ITEMS" || typeof element.rawValue !== "object" || element.rawValue === null) continue;
    const value = element.rawValue as Record<string, unknown>;
    const match = typeof value.id === "string" ? /^items:(\d+)$/u.exec(value.id) : null;
    if (match === null || typeof value.name !== "string" || value.name.trim() === "") continue;
    items.set(normalizeName(value.name), {
      id: Number(match[1]),
      name: value.name.trim(),
      remoteImageUrl: typeof value.image === "string" && URL.canParse(value.image) ? value.image : null,
    });
  }
  return items;
}

export interface ResolveGuideStepItemsOptions {
  itemFetch?: typeof fetch;
  publicItemDirectory?: string;
  metadataOnly?: boolean;
}

export async function resolveGuideStepItems(
  content: QuestGuideContent,
  step: GuideStepRecord,
  options: ResolveGuideStepItemsOptions = {},
): Promise<QuestGuideContent> {
  const knownItems = knownGuideStepItems(step);
  const outputDirectory = path.resolve(options.publicItemDirectory ?? "public/items");
  const requestFetch = options.itemFetch ?? fetch;
  const resolved = [];
  for (const item of content.items) {
    if (item.itemId !== null && item.imageUrl !== null && item.dofusDbUrl !== null) {
      resolved.push(item);
      continue;
    }
    const known = knownItems.get(normalizeName(item.name));
    if (known === undefined) {
      resolved.push(item);
      continue;
    }
    const imageUrl = "/items/" + known.id + ".png";
    const target = path.join(outputDirectory, known.id + ".png");
    let localizedImageUrl: string | null = await exists(target) ? imageUrl : null;
    if (localizedImageUrl === null && !options.metadataOnly && known.remoteImageUrl !== null) {
      try {
        const response = await requestFetch(known.remoteImageUrl, { headers: { accept: "image/*", "user-agent": "DofusGuideScraper/0.1.0 (local guide item archival client)" } });
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/") || bytes.length === 0) throw new Error("invalid image response");
        await atomicWriteFile(target, bytes);
        localizedImageUrl = imageUrl;
      } catch (error) {
        console.warn("[guide item] unable to archive image for " + known.name + ": " + String(error));
      }
    }
    resolved.push({
      name: known.name,
      itemId: known.id,
      imageUrl: localizedImageUrl,
      dofusDbUrl: "https://dofusdb.fr/fr/database/item/" + known.id,
    });
  }
  return { ...content, items: resolved };
}
