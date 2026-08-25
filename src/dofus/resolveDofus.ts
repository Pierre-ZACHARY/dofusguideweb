import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { DOFUS_TAG_DEFINITIONS } from "./tagDefinitions.js";
import { dofusDbItemSchema, type DofusDbItemArchive } from "./types.js";

export interface ResolvedDofus {
  tag: string;
  itemId: number;
  level: number | null;
  name: string;
  description: string;
  imageUrl: string | null;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadResolvedDofus(
  archivePath = "data/dofusdb/dofus.json",
  publicImageDirectory = "public/dofus",
): Promise<ResolvedDofus[]> {
  const resolvedArchive = path.resolve(archivePath);
  if (!await exists(resolvedArchive)) return [];
  const archive = JSON.parse(await readFile(resolvedArchive, "utf8")) as Partial<DofusDbItemArchive>;
  if (!Array.isArray(archive.items)) return [];
  const items = archive.items.map((item) => dofusDbItemSchema.parse(item));
  const resolved = await Promise.all(DOFUS_TAG_DEFINITIONS.map(async (definition) => {
    const item = items.find((candidate) => candidate.id === definition.itemId);
    if (!item) throw new Error("Missing DofusDB item " + definition.itemId + " for tag " + definition.tag);
    const localImage = path.resolve(publicImageDirectory, String(item.id) + ".png");
    return {
      tag: definition.tag,
      itemId: item.id,
      level: item.level ?? null,
      name: item.name.fr ?? item.name.en ?? definition.tag,
      description: item.description.fr ?? item.description.en ?? "",
      imageUrl: await exists(localImage) ? "/dofus/" + item.id + ".png" : null,
    };
  }));
  return resolved.sort((left, right) =>
    (left.level ?? Number.MAX_SAFE_INTEGER) - (right.level ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name, "fr"),
  );
}
