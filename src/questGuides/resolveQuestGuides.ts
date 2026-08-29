import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  questGuideArchiveSchema,
  questGuideStepArchiveSchema,
  type QuestGuideStepArchive,
  type QuestGuideSummary,
} from "./types.js";

const defaultSummaryPath = "data/generated/quest-summaries";

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export function normalizeGeneratedSourceUrl(value: string): string {
  const match = /https?:\/\/[^\s\])"']+/iu.exec(value.trim());
  return match?.[0] ?? value;
}

function normalizeGeneratedArchive(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const archive = value as Record<string, unknown>;
  if (!Array.isArray(archive.summaries)) return value;
  return {
    ...archive,
    summaries: archive.summaries.map((summary) => {
      if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return summary;
      const record = summary as Record<string, unknown>;
      return typeof record.sourceUrl === "string"
        ? { ...record, sourceUrl: normalizeGeneratedSourceUrl(record.sourceUrl) }
        : summary;
    }),
  };
}

function parseStepArchive(contents: string, filePath: string): QuestGuideStepArchive {
  try {
    return questGuideStepArchiveSchema.parse(normalizeGeneratedArchive(JSON.parse(contents)));
  } catch (error) {
    throw new Error("Invalid quest guide step archive: " + filePath, { cause: error });
  }
}

function configuredSummaryPath(): string {
  return process.env.DOFUSGUIDE_QUEST_SUMMARIES ?? defaultSummaryPath;
}

export function questGuideStepPath(guideId: number, stepNumber: number, rootPath = configuredSummaryPath()): string {
  return path.resolve(rootPath, String(guideId), String(stepNumber).padStart(4, "0") + ".json");
}

async function existingStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface CachedStepArchive {
  mtimeMs: number;
  archive: QuestGuideStepArchive;
}

const stepCache = new Map<string, CachedStepArchive>();

export async function loadQuestGuideStepArchive(
  guideId: number,
  stepNumber: number,
  rootPath = configuredSummaryPath(),
): Promise<QuestGuideStepArchive | null> {
  const filePath = questGuideStepPath(guideId, stepNumber, rootPath);
  const fileStat = await existingStat(filePath);
  if (fileStat === null) return null;
  const cached = stepCache.get(filePath);
  if (cached?.mtimeMs === fileStat.mtimeMs) return cached.archive;
  const archive = parseStepArchive(await readFile(filePath, "utf8"), filePath);
  if (archive.guideId !== guideId || archive.stepNumber !== stepNumber) {
    throw new Error("Quest guide step identity does not match its path: " + filePath);
  }
  stepCache.set(filePath, { mtimeMs: fileStat.mtimeMs, archive });
  return archive;
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }));
  return nested.flat().sort();
}

export async function loadQuestGuideSummaries(
  archivePath = configuredSummaryPath(),
): Promise<Map<string, QuestGuideSummary>> {
  const resolvedPath = path.resolve(archivePath);
  const archiveStat = await existingStat(resolvedPath);
  if (archiveStat === null) return new Map();
  if (archiveStat.isFile()) {
    const archive = questGuideArchiveSchema.parse(JSON.parse(await readFile(resolvedPath, "utf8")));
    return new Map(archive.summaries.map((summary) => [canonicalUrl(summary.sourceUrl), summary]));
  }

  const summaries = new Map<string, QuestGuideSummary>();
  for (const filePath of await jsonFiles(resolvedPath)) {
    const archive = parseStepArchive(await readFile(filePath, "utf8"), filePath);
    for (const summary of archive.summaries) summaries.set(canonicalUrl(summary.sourceUrl), summary);
  }
  return summaries;
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
