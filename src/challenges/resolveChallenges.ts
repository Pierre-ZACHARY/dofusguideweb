import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeName } from "../normalizer/names.js";
import { dofusDbChallengeSchema, type DofusDbChallenge, type DofusDbChallengeArchive } from "./types.js";

export interface DungeonSuccessLike {
  id: string | number | null;
  name: string;
  description: string | null;
}

export interface ResolvedChallenge {
  successId: string;
  challengeId: number | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

let cachedArchivePath: string | null = null;
let cachedChallenges: DofusDbChallenge[] | null = null;

function words(value: string | null): Set<string> {
  return new Set(normalizeName(value ?? "").split(" ").filter((word) => word.length > 2));
}

function descriptionScore(expected: string | null, candidate: string): number {
  const expectedWords = words(expected);
  const candidateWords = words(candidate);
  if (expectedWords.size === 0 || candidateWords.size === 0) return 0;
  let shared = 0;
  for (const word of expectedWords) if (candidateWords.has(word)) shared += 1;
  return shared / Math.max(expectedWords.size, candidateWords.size);
}

export function matchChallenge(success: DungeonSuccessLike, challenges: DofusDbChallenge[]): DofusDbChallenge | null {
  const normalizedName = normalizeName(success.name);
  const matches = challenges.filter((challenge) => normalizeName(challenge.name.fr ?? challenge.name.en ?? "") === normalizedName);
  return matches
    .map((challenge) => ({ challenge, score: descriptionScore(success.description, challenge.description.fr ?? challenge.description.en ?? "") }))
    .sort((left, right) => right.score - left.score || left.challenge.id - right.challenge.id)[0]?.challenge ?? null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadChallenges(archivePath: string): Promise<DofusDbChallenge[]> {
  const resolvedPath = path.resolve(archivePath);
  if (cachedArchivePath === resolvedPath && cachedChallenges !== null) return cachedChallenges;
  if (!await fileExists(resolvedPath)) return [];
  const archive = JSON.parse(await readFile(resolvedPath, "utf8")) as Partial<DofusDbChallengeArchive>;
  cachedChallenges = Array.isArray(archive.challenges)
    ? archive.challenges.map((challenge) => dofusDbChallengeSchema.parse(challenge))
    : [];
  cachedArchivePath = resolvedPath;
  return cachedChallenges;
}

export async function resolveDungeonChallenges(
  successes: DungeonSuccessLike[],
  options: { archivePath?: string; publicImageDirectory?: string } = {},
): Promise<ResolvedChallenge[]> {
  const challenges = await loadChallenges(options.archivePath ?? "data/dofusdb/challenges.json");
  const imageDirectory = path.resolve(options.publicImageDirectory ?? "public/challenges");
  return Promise.all(successes.map(async (success) => {
    const match = matchChallenge(success, challenges);
    const imageId = match?.iconId ?? match?.id;
    const imagePath = imageId === undefined ? null : path.join(imageDirectory, String(imageId) + ".png");
    return {
      successId: String(success.id ?? success.name),
      challengeId: match?.id ?? null,
      name: success.name,
      description: success.description,
      imageUrl: imagePath !== null && await fileExists(imagePath) ? "/challenges/" + imageId + ".png" : null,
    };
  }));
}
