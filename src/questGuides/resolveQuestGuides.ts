import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { questGuideArchiveSchema, type QuestGuideSummary } from "./types.js";

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let cachedPath: string | null = null;
let cachedMtimeMs: number | null = null;
let cachedSummaries: Map<string, QuestGuideSummary> | null = null;

export async function loadQuestGuideSummaries(
  archivePath = process.env.DOFUSGUIDE_QUEST_SUMMARIES ?? "data/generated/quest-summaries.json",
): Promise<Map<string, QuestGuideSummary>> {
  const resolvedPath = path.resolve(archivePath);
  if (!await fileExists(resolvedPath)) return new Map();
  const mtimeMs = (await stat(resolvedPath)).mtimeMs;
  if (cachedPath === resolvedPath && cachedMtimeMs === mtimeMs && cachedSummaries !== null) return cachedSummaries;
  const archive = questGuideArchiveSchema.parse(JSON.parse(await readFile(resolvedPath, "utf8")));
  cachedPath = resolvedPath;
  cachedMtimeMs = mtimeMs;
  cachedSummaries = new Map(archive.summaries.map((summary) => [canonicalUrl(summary.sourceUrl), summary]));
  return cachedSummaries;
}

export async function resolveQuestGuideSummary(
  sourceUrl: string | null,
  archivePath?: string,
): Promise<QuestGuideSummary | null> {
  if (sourceUrl === null) return null;
  try {
    return (await loadQuestGuideSummaries(archivePath)).get(canonicalUrl(sourceUrl)) ?? null;
  } catch (error) {
    console.warn("[summary] unable to load local quest summary:", error);
    return null;
  }
}
