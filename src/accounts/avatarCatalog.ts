import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { dofusDbBreedSchema, type DofusDbBreedArchive } from "../breeds/types.js";
import type { ProfileAvatar, ProfileGender } from "./types.js";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadProfileAvatars(
  archivePath = "data/dofusdb/breeds.json",
  publicDirectory = "public/profile-avatars",
): Promise<ProfileAvatar[]> {
  if (!await exists(path.resolve(archivePath))) return [];
  const archive = JSON.parse(await readFile(path.resolve(archivePath), "utf8")) as Partial<DofusDbBreedArchive>;
  if (!Array.isArray(archive.breeds)) return [];
  const avatars: ProfileAvatar[] = [];
  for (const rawBreed of archive.breeds) {
    const breed = dofusDbBreedSchema.parse(rawBreed);
    const breedName = breed.shortName.fr ?? breed.shortName.en ?? "Classe " + breed.id;
    for (const gender of ["MALE", "FEMALE"] as const) {
      const suffix = gender === "MALE" ? "male" : "female";
      const fullBodyPath = path.resolve(publicDirectory, breed.id + "-" + suffix + "-full.png");
      const legacyHeadPath = path.resolve(publicDirectory, breed.id + "-" + suffix + ".png");
      const imageUrl = await exists(fullBodyPath)
        ? "/profile-avatars/" + breed.id + "-" + suffix + "-full.png"
        : await exists(legacyHeadPath)
          ? "/profile-avatars/" + breed.id + "-" + suffix + ".png"
          : null;
      avatars.push({ key: breed.id + ":" + gender, breedId: breed.id, breedName, gender, imageUrl });
    }
  }
  return avatars.sort((left, right) => left.breedId - right.breedId || left.gender.localeCompare(right.gender));
}

export function findProfileAvatar(
  avatars: ProfileAvatar[],
  breedId: number,
  gender: ProfileGender,
): ProfileAvatar | null {
  return avatars.find((avatar) => avatar.breedId === breedId && avatar.gender === gender) ?? null;
}
