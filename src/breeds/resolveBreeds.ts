import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeName } from "../normalizer/names.js";
import { dofusDbBreedSchema, type DofusDbBreedArchive } from "./types.js";

export interface ResolvedBreed {
  id: number;
  name: string;
  gameplay: string | null;
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

export async function loadResolvedBreeds(
  archivePath = "data/dofusdb/breeds.json",
  publicImageDirectory = "public/breeds",
): Promise<ResolvedBreed[]> {
  const resolvedArchive = path.resolve(archivePath);
  if (!await exists(resolvedArchive)) return [];
  const archive = JSON.parse(await readFile(resolvedArchive, "utf8")) as Partial<DofusDbBreedArchive>;
  if (!Array.isArray(archive.breeds)) return [];
  return Promise.all(archive.breeds.map(async (rawBreed) => {
    const breed = dofusDbBreedSchema.parse(rawBreed);
    const localImage = path.resolve(publicImageDirectory, String(breed.id) + ".png");
    return {
      id: breed.id,
      name: breed.shortName.fr ?? breed.shortName.en ?? "Classe " + breed.id,
      gameplay: breed.gameplayDescription?.fr ?? null,
      imageUrl: await exists(localImage) ? "/breeds/" + breed.id + ".png" : null,
    };
  }));
}

export function findBreedByName(breeds: ResolvedBreed[], name: string): ResolvedBreed | null {
  const normalized = normalizeName(name);
  return breeds.find((breed) => normalizeName(breed.name) === normalized) ?? null;
}
