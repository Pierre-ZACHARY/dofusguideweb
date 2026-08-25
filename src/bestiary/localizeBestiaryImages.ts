import { access } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import type { QuestBestiary } from "./types.js";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface LocalizeBestiaryImageOptions {
  bestiaryImageFetch?: typeof fetch;
  publicBestiaryImageDirectory?: string;
  bestiaryImageDelayMs?: number;
  metadataOnly?: boolean;
}

export async function localizeBestiaryImages(bestiary: QuestBestiary, options: LocalizeBestiaryImageOptions = {}): Promise<QuestBestiary> {
  const monsters = new Map([
    ...bestiary.bounties,
    ...bestiary.archmonsters,
    ...bestiary.achievements.flatMap((achievement) => achievement.monsters),
  ].map((monster) => [monster.id, monster]));
  const localUrls = new Map<number, string | null>();
  const requestFetch = options.bestiaryImageFetch ?? fetch;
  const outputDirectory = options.publicBestiaryImageDirectory ?? "public/bestiary/monsters";

  for (const monster of monsters.values()) {
    const publicUrl = "/bestiary/monsters/" + monster.id + ".png";
    const target = path.resolve(outputDirectory, monster.id + ".png");
    if (await exists(target)) {
      localUrls.set(monster.id, publicUrl);
      continue;
    }
    if (options.metadataOnly || monster.imageUrl === null) {
      localUrls.set(monster.id, null);
      continue;
    }
    try {
      const response = await retry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
          const result = await requestFetch(monster.imageUrl!, { headers: { accept: "image/*", "user-agent": "DofusGuideScraper/0.1.0 (local bestiary image archival client)" }, signal: controller.signal });
          if (!result.ok) throw new Error("HTTP " + result.status);
          return result;
        } finally {
          clearTimeout(timeout);
        }
      }, { maxRetries: 2, shouldRetry: () => true });
      const contentType = response.headers.get("content-type") ?? "";
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!contentType.startsWith("image/") || bytes.length === 0) throw new Error("not an image");
      await atomicWriteFile(target, bytes);
      localUrls.set(monster.id, publicUrl);
      await sleep(options.bestiaryImageDelayMs ?? 25);
    } catch (error) {
      console.warn("[bestiary] unable to archive image for " + monster.name + ": " + String(error));
      localUrls.set(monster.id, null);
    }
  }

  const localize = <T extends { id: number; imageUrl: string | null }>(monster: T): T => ({ ...monster, imageUrl: localUrls.get(monster.id) ?? null });
  return {
    ...bestiary,
    bounties: bestiary.bounties.map(localize),
    archmonsters: bestiary.archmonsters.map(localize),
    achievements: bestiary.achievements.map((achievement) => ({ ...achievement, monsters: achievement.monsters.map(localize) })),
  };
}
