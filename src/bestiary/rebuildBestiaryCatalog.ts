import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { atomicWriteFile } from "../utils/fs.js";
import { buildBestiaryCatalog } from "./buildCatalog.js";
import type { BestiaryCatalog } from "./types.js";

const rawArchiveSchema = z.object({
  source: z.string(),
  scrapedAt: z.string(),
  data: z.array(z.record(z.string(), z.unknown())),
});

async function loadRaw(directory: string, name: string) {
  return rawArchiveSchema.parse(JSON.parse(await readFile(path.resolve(directory, "raw", name + ".json"), "utf8")));
}

export async function rebuildBestiaryCatalog(outputDirectory = "data/dofusdb"): Promise<BestiaryCatalog> {
  const [monsters, dungeons, achievements, subareas, mapPositions] = await Promise.all([
    loadRaw(outputDirectory, "monsters"),
    loadRaw(outputDirectory, "dungeons"),
    loadRaw(outputDirectory, "achievements"),
    loadRaw(outputDirectory, "subareas"),
    loadRaw(outputDirectory, "map-positions"),
  ]);
  const catalog = buildBestiaryCatalog({
    source: new URL(monsters.source).origin,
    scrapedAt: [monsters, dungeons, achievements, subareas, mapPositions].map((archive) => archive.scrapedAt).sort().at(-1)!,
    monsters: monsters.data,
    dungeons: dungeons.data,
    achievements: achievements.data,
    subareas: subareas.data,
    mapPositions: mapPositions.data,
  });
  await atomicWriteFile(path.resolve(outputDirectory, "bestiary.json"), Buffer.from(JSON.stringify(catalog, null, 2) + "\n", "utf8"));
  console.info("[dofusdb] bestiary catalog rebuilt from raw archives");
  return catalog;
}
