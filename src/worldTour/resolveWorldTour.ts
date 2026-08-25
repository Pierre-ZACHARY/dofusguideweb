import { readFile } from "node:fs/promises";
import path from "node:path";
import { worldTourArchiveSchema, type WorldTourArchive } from "./types.js";

export async function loadWorldTour(
  archivePath = "data/dofusdb/world-tour.json",
): Promise<WorldTourArchive | null> {
  try {
    return worldTourArchiveSchema.parse(JSON.parse(await readFile(path.resolve(archivePath), "utf8")) as unknown);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
