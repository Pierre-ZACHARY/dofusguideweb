import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SqliteDofusGuideRepository } from "../repositories/sqliteDofusGuideRepository.js";
import { atomicWriteFile } from "../utils/fs.js";
import { sleep } from "../utils/sleep.js";
import { canonicalSourceUrl } from "./dplnArticleCache.js";
import { fetchDplnArticle } from "./fetchDplnArticle.js";

const sourceReferenceSchema = z.object({
  questKey: z.string().trim().min(1),
  sourceUrl: z.url(),
  sourceTitle: z.string().trim().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  relation: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const stepSourceArchiveSchema = z.object({
  guideId: z.number().int(),
  stepNumber: z.number().int().positive(),
  summaries: z.array(sourceReferenceSchema),
});

interface SourceUsage {
  generatedHashes: Set<string>;
  affectedSteps: Set<number>;
  questKeys: Set<string>;
  expectedOccurrences: Set<string>;
  generatedOccurrences: Set<string>;
}

export interface DplnSourceHashEntry {
  sourceUrl: string;
  sourceTitle: string;
  currentHash: string;
  generatedHashes: string[];
  affectedSteps: number[];
  questKeys: string[];
  missingTutorialSteps: number[];
  needsRegeneration: boolean;
}

export interface DplnSourceHashReport {
  version: 1;
  guideId: number;
  sourceCount: number;
  currentSourceCount: number;
  staleSourceCount: number;
  staleSteps: number[];
  sources: DplnSourceHashEntry[];
}

export interface AuditDplnSourceHashesOptions {
  inputDirectory?: string;
  outputPath?: string;
  delayMs?: number;
  requestFetch?: typeof fetch;
  databasePath?: string;
}

function occurrenceKey(stepNumber: number, questKey: string, relation: string, sortOrder: number): string {
  return [stepNumber, questKey, relation, sortOrder].join("|");
}

function emptyUsage(): SourceUsage {
  return {
    generatedHashes: new Set<string>(),
    affectedSteps: new Set<number>(),
    questKeys: new Set<string>(),
    expectedOccurrences: new Set<string>(),
    generatedOccurrences: new Set<string>(),
  };
}

async function loadSourceUsages(inputDirectory: string): Promise<{ guideId: number; usages: Map<string, SourceUsage> }> {
  const files = (await readdir(inputDirectory))
    .filter((file) => /^\d{4}\.json$/u.test(file))
    .sort();
  if (files.length === 0) throw new Error("No generated tutorial archives found in " + inputDirectory);

  let guideId: number | undefined;
  const usages = new Map<string, SourceUsage>();
  for (const file of files) {
    const filePath = path.join(inputDirectory, file);
    const archive = stepSourceArchiveSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
    if (guideId === undefined) guideId = archive.guideId;
    if (archive.guideId !== guideId) throw new Error("Mixed guide ids in " + inputDirectory);

    for (const summary of archive.summaries) {
      const sourceUrl = canonicalSourceUrl(summary.sourceUrl);
      const usage = usages.get(sourceUrl) ?? emptyUsage();
      usage.generatedHashes.add(summary.sourceHash);
      usage.affectedSteps.add(archive.stepNumber);
      usage.questKeys.add(summary.questKey);
      usage.generatedOccurrences.add(occurrenceKey(
        archive.stepNumber,
        summary.questKey,
        summary.relation ?? "UNKNOWN",
        summary.sortOrder ?? 0,
      ));
      usages.set(sourceUrl, usage);
    }
  }
  if (guideId === undefined) throw new Error("Unable to determine guide id from " + inputDirectory);
  return { guideId, usages };
}

export async function auditDplnSourceHashes(options: AuditDplnSourceHashesOptions = {}): Promise<DplnSourceHashReport> {
  const inputDirectory = path.resolve(options.inputDirectory ?? "data/generated/quest-summaries/-1");
  const outputPath = path.resolve(options.outputPath ?? "data/generated/dofuspourlesnoobs-source-hashes.json");
  const delayMs = options.delayMs ?? 250;
  const requestFetch = options.requestFetch ?? fetch;
  const { guideId, usages } = await loadSourceUsages(inputDirectory);
  if (options.databasePath !== undefined) {
    const repository = new SqliteDofusGuideRepository(options.databasePath);
    try {
      for (const stepSummary of repository.listGuideSteps(guideId)) {
        const step = repository.getGuideStep(guideId, stepSummary.stepNumber);
        if (step === undefined) continue;
        for (const quest of step.quests) {
          if (quest.externalUrl === null) continue;
          const sourceUrl = canonicalSourceUrl(quest.externalUrl);
          const usage = usages.get(sourceUrl) ?? emptyUsage();
          usage.affectedSteps.add(step.stepNumber);
          usage.questKeys.add(quest.questKey);
          usage.expectedOccurrences.add(occurrenceKey(step.stepNumber, quest.questKey, quest.relationType, quest.sortOrder));
          usages.set(sourceUrl, usage);
        }
      }
    } finally {
      repository.close();
    }
  }
  const entries: DplnSourceHashEntry[] = [];

  for (const [index, sourceUrl] of [...usages.keys()].sort().entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const article = await fetchDplnArticle(sourceUrl, requestFetch);
    const usage = usages.get(sourceUrl)!;
    const generatedHashes = [...usage.generatedHashes].sort();
    const missingOccurrences = [...usage.expectedOccurrences]
      .filter((occurrence) => !usage.generatedOccurrences.has(occurrence));
    const missingTutorialSteps = [...new Set(missingOccurrences.map((occurrence) => Number(occurrence.split("|", 1)[0])))]
      .sort((left, right) => left - right);
    entries.push({
      sourceUrl,
      sourceTitle: article.title,
      currentHash: article.sourceHash,
      generatedHashes,
      affectedSteps: [...usage.affectedSteps].sort((left, right) => left - right),
      questKeys: [...usage.questKeys].sort(),
      missingTutorialSteps,
      needsRegeneration: missingOccurrences.length > 0
        || generatedHashes.length === 0
        || generatedHashes.some((hash) => hash !== article.sourceHash),
    });
    console.info("[dpln hashes] " + (index + 1) + "/" + usages.size + " " + sourceUrl);
  }

  const staleSources = entries.filter((entry) => entry.needsRegeneration);
  const report: DplnSourceHashReport = {
    version: 1,
    guideId,
    sourceCount: entries.length,
    currentSourceCount: entries.length - staleSources.length,
    staleSourceCount: staleSources.length,
    staleSteps: [...new Set(staleSources.flatMap((entry) => entry.affectedSteps))].sort((left, right) => left - right),
    sources: entries,
  };
  await atomicWriteFile(outputPath, Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8"));
  return report;
}
