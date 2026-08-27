import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { enrichQuestGuideBestiary, loadBestiaryCatalog } from "../bestiary/resolveBestiary.js";
import { localizeBestiaryImages, type LocalizeBestiaryImageOptions } from "../bestiary/localizeBestiaryImages.js";
import type { DofusGuideRepository } from "../repositories/contracts.js";
import { atomicWriteFile } from "../utils/fs.js";
import { cacheSourceArticle, canonicalSourceUrl, loadCachedSourceArticle } from "./dplnArticleCache.js";
import { fetchDplnArticle } from "./fetchDplnArticle.js";
import { resolveQuestGuideItems, type ResolveDofusDbItemsOptions } from "./resolveDofusDbItems.js";
import { resolveGuideStepItems } from "./resolveGuideStepItems.js";
import {
  questGuideContentSchema,
  questGuideStepArchiveSchema,
  questGuideStepTipSchema,
  type QuestGuideStepTip,
  type QuestGuideSummary,
} from "./types.js";
import { questGuideStepPath } from "./resolveQuestGuides.js";

const rawArchiveSchema = z.object({
  version: z.literal(2),
  guideId: z.number().int(),
  stepNumber: z.number().int().positive(),
  updatedAt: z.unknown().optional(),
  summaries: z.array(z.record(z.string(), z.unknown())),
  tips: z.array(questGuideStepTipSchema),
});

const nullableMetadataSchema = z.object({
  generatedAt: z.iso.datetime().nullable().optional(),
  model: z.string().trim().min(1).nullable().optional(),
});

export interface EnrichStepArchivesOptions extends ResolveDofusDbItemsOptions, LocalizeBestiaryImageOptions {
  guideId: number;
  inputDirectory?: string;
  sourceCacheDirectory?: string;
  bestiaryCatalogPath?: string;
  stepMin?: number;
  stepMax?: number;
  fetchSource?: typeof fetch;
}

export interface EnrichStepArchivesResult {
  filesWritten: number;
  summariesProcessed: number;
  sourceMetadataRepaired: number;
  questReferencesResolved: number;
  itemsResolved: number;
  unresolvedItems: Array<{ stepNumber: number; questKey: string; itemName: string }>;
}

function sameSourceMetadata(raw: Record<string, unknown>, article: { sourceUrl: string; title: string; sourceHash: string }): boolean {
  return raw.sourceUrl === article.sourceUrl && raw.sourceTitle === article.title && raw.sourceHash === article.sourceHash;
}

export function resolveQuestTipReferences(
  tip: QuestGuideStepTip,
  repository: Pick<DofusGuideRepository, "getQuest">,
): { tip: QuestGuideStepTip; replacements: number } {
  let replacements = 0;
  const replace = (value: string): string => value.replace(/\bquest:\d+\b/gu, (questKey) => {
    const questName = repository.getQuest(questKey)?.originalName?.trim();
    if (!questName) return questKey;
    replacements += 1;
    return questName;
  });
  return {
    tip: {
      ...tip,
      title: replace(tip.title),
      description: replace(tip.description),
      actions: tip.actions.map(replace),
    },
    replacements,
  };
}

export async function enrichStepArchives(
  repository: DofusGuideRepository,
  options: EnrichStepArchivesOptions,
): Promise<EnrichStepArchivesResult> {
  const inputDirectory = options.inputDirectory ?? "data/generated/quest-summaries";
  const sourceCacheDirectory = path.resolve(options.sourceCacheDirectory ?? "prompt/.cache/dofuspourlesnoobs");
  const catalog = await loadBestiaryCatalog(options.bestiaryCatalogPath);
  const requestFetch = options.fetchSource ?? fetch;
  const result: EnrichStepArchivesResult = {
    filesWritten: 0,
    summariesProcessed: 0,
    sourceMetadataRepaired: 0,
    questReferencesResolved: 0,
    itemsResolved: 0,
    unresolvedItems: [],
  };

  const steps = repository.listGuideSteps(options.guideId)
    .filter((step) => step.title !== null)
    .filter((step) => options.stepMin === undefined || step.stepNumber >= options.stepMin)
    .filter((step) => options.stepMax === undefined || step.stepNumber <= options.stepMax);

  for (const stepSummary of steps) {
    const filePath = questGuideStepPath(options.guideId, stepSummary.stepNumber, inputDirectory);
    const rawArchive = rawArchiveSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
    if (rawArchive.guideId !== options.guideId || rawArchive.stepNumber !== stepSummary.stepNumber) {
      throw new Error("Quest guide step identity does not match its path: " + filePath);
    }
    if (rawArchive.summaries.length === 0) continue;

    const step = repository.getGuideStep(options.guideId, stepSummary.stepNumber);
    if (step === undefined) throw new Error("Unable to load step " + stepSummary.stepNumber);
    const questByKey = new Map(step.quests.map((quest) => [quest.questKey, quest]));
    const summaries: QuestGuideSummary[] = [];

    for (const rawSummary of rawArchive.summaries) {
      const questKey = z.string().trim().min(1).parse(rawSummary.questKey);
      const quest = questByKey.get(questKey);
      if (quest === undefined) throw new Error("Step " + step.stepNumber + " summarizes an unrelated quest: " + questKey);
      if (quest.externalUrl === null) throw new Error("Quest " + questKey + " has no source URL");
      const expectedUrl = canonicalSourceUrl(quest.externalUrl);
      let article = await loadCachedSourceArticle(sourceCacheDirectory, expectedUrl);
      if (article === null) {
        article = await fetchDplnArticle(expectedUrl, requestFetch);
        await cacheSourceArticle(sourceCacheDirectory, article);
      }
      if (!sameSourceMetadata(rawSummary, article)) result.sourceMetadataRepaired += 1;

      let metadata: z.infer<typeof nullableMetadataSchema>;
      let content: z.infer<typeof questGuideContentSchema>;
      try {
        metadata = nullableMetadataSchema.parse(rawSummary);
        content = questGuideContentSchema.parse(rawSummary);
      } catch (error) {
        throw new Error("Invalid generated tutorial at step " + step.stepNumber + " for " + questKey, { cause: error });
      }
      const unresolvedBefore = content.items.filter((item) => item.itemId === null || item.imageUrl === null || item.dofusDbUrl === null).length;
      const guideItems = await resolveGuideStepItems(content, step, options);
      const enrichedItems = await resolveQuestGuideItems(guideItems, options);
      const unresolvedAfter = enrichedItems.items.filter((item) => item.itemId === null || item.imageUrl === null || item.dofusDbUrl === null);
      result.itemsResolved += unresolvedBefore - unresolvedAfter.length;
      result.unresolvedItems.push(...unresolvedAfter.map((item) => ({ stepNumber: step.stepNumber, questKey, itemName: item.name })));

      const bestiary = await localizeBestiaryImages(enrichQuestGuideBestiary(enrichedItems, catalog), options);
      summaries.push({
        ...enrichedItems,
        bestiary,
        questKey,
        sourceUrl: article.sourceUrl,
        sourceTitle: article.title,
        sourceHash: article.sourceHash,
        generatedAt: metadata.generatedAt ?? null,
        model: metadata.model ?? null,
      });
      result.summariesProcessed += 1;
    }

    const tips = rawArchive.tips.map((tip) => {
      const resolved = resolveQuestTipReferences(tip, repository);
      result.questReferencesResolved += resolved.replacements;
      return resolved.tip;
    });
    const contents = {
      version: 2,
      guideId: options.guideId,
      stepNumber: step.stepNumber,
      summaries,
      tips,
    } as const;
    const previousContents = {
      version: rawArchive.version,
      guideId: rawArchive.guideId,
      stepNumber: rawArchive.stepNumber,
      summaries: rawArchive.summaries,
      tips: rawArchive.tips,
    };
    if (JSON.stringify(contents) === JSON.stringify(previousContents)) continue;

    const archive = questGuideStepArchiveSchema.parse({
      ...contents,
      updatedAt: new Date().toISOString(),
    });
    await atomicWriteFile(filePath, Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));
    result.filesWritten += 1;
  }

  return result;
}
