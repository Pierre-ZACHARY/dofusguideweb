import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";
import { sleep } from "../utils/sleep.js";
import { assertAllowedDplnSource, fetchDplnArticle } from "./fetchDplnArticle.js";
import { generateQuestSummary, type GenerateQuestSummaryOptions } from "./generateQuestSummary.js";
import { resolveQuestGuideItems, type ResolveDofusDbItemsOptions } from "./resolveDofusDbItems.js";
import { questGuideArchiveSchema, type QuestGuideArchive, type QuestGuideSummary } from "./types.js";
import { enrichQuestGuideBestiary, loadBestiaryCatalog } from "../bestiary/resolveBestiary.js";
import type { BestiaryCatalog } from "../bestiary/types.js";
import { localizeBestiaryImages, type LocalizeBestiaryImageOptions } from "../bestiary/localizeBestiaryImages.js";

export interface QuestGuideTarget { questKey: string; sourceUrl: string }

export interface SummarizeQuestGuidesOptions extends GenerateQuestSummaryOptions, ResolveDofusDbItemsOptions, LocalizeBestiaryImageOptions {
  outputPath?: string;
  delayMs?: number;
  force?: boolean;
  fetchSource?: typeof fetch;
  bestiaryCatalogPath?: string;
  concurrency?: number;
}

async function enrichBestiary(content: import("./types.js").QuestGuideContent, catalog: BestiaryCatalog | null, options: SummarizeQuestGuidesOptions) {
  return catalog === null ? undefined : localizeBestiaryImages(enrichQuestGuideBestiary(content, catalog), options);
}

async function loadOptionalBestiary(catalogPath: string | undefined): Promise<BestiaryCatalog | null> {
  try {
    return await loadBestiaryCatalog(catalogPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn("[summary] no local bestiary catalog; run npm run scrape-bestiary before enrichment");
      return null;
    }
    throw error;
  }
}

async function loadArchive(filePath: string): Promise<QuestGuideArchive> {
  try {
    return questGuideArchiveSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { version: 1, updatedAt: new Date(0).toISOString(), summaries: [] };
  }
}

export async function summarizeQuestGuides(targets: QuestGuideTarget[], options: SummarizeQuestGuidesOptions = {}): Promise<QuestGuideArchive> {
  const outputPath = path.resolve(options.outputPath ?? "prompt/legacy/quest-summaries.json");
  const archive = await loadArchive(outputPath);
  const byUrl = new Map(archive.summaries.map((summary) => [assertAllowedDplnSource(summary.sourceUrl).toString(), summary]));
  const requestFetch = options.fetchSource ?? fetch;
  const bestiary = await loadOptionalBestiary(options.bestiaryCatalogPath);
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("concurrency must be an integer between 1 and 3");
  const uniqueTargets = [...new Map(targets.map((target) => [assertAllowedDplnSource(target.sourceUrl).toString(), target])).values()];
  let processed = 0;
  const failures: Error[] = [];

  async function writeArchive(): Promise<void> {
    await atomicWriteFile(outputPath, Buffer.from(JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      summaries: [...byUrl.values()].sort((left, right) => left.questKey.localeCompare(right.questKey, "fr")),
    }, null, 2) + "\n", "utf8"));
  }

  for (let batchStart = 0; batchStart < uniqueTargets.length; batchStart += concurrency) {
    const batch = uniqueTargets.slice(batchStart, batchStart + concurrency);
    const prepared: Array<{ target: QuestGuideTarget; url: URL; article: Awaited<ReturnType<typeof fetchDplnArticle>> }> = [];

    for (const target of batch) {
      const url = assertAllowedDplnSource(target.sourceUrl);
      let article: Awaited<ReturnType<typeof fetchDplnArticle>>;
      try {
        article = await fetchDplnArticle(url.toString(), requestFetch);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        failures.push(new Error(target.questKey + " · " + url.toString() + ": " + failure.message, { cause: failure }));
        console.error("[summary] source failed " + target.questKey + " · " + failure.message);
        processed += 1;
        if (processed < uniqueTargets.length) await sleep(options.delayMs ?? 1_000);
        continue;
      }
      const existing = byUrl.get(url.toString());
      const needsZoneHints = existing?.actions.some((action) => action.zoneHint === undefined) ?? false;
      if (!options.force && existing?.sourceHash === article.sourceHash && !needsZoneHints) {
        const enriched = await resolveQuestGuideItems(existing, options);
        const enrichedBestiary = await enrichBestiary(enriched, bestiary, options);
        byUrl.set(url.toString(), {
          ...existing,
          ...enriched,
          ...(enrichedBestiary === undefined ? {} : { bestiary: enrichedBestiary }),
        });
        console.info("[summary] unchanged " + target.questKey + " · " + article.title);
        await writeArchive();
      } else {
        if (needsZoneHints) console.info("[summary] regenerating " + target.questKey + " to extract exact subareas");
        prepared.push({ target, url, article });
      }
      processed += 1;
      if (processed < uniqueTargets.length) await sleep(options.delayMs ?? 1_000);
    }

    const generated = await Promise.allSettled(prepared.map(async ({ target, article }, index) => {
      console.info("[summary " + String(index + 1) + "/" + String(prepared.length) + "] generating " + target.questKey + " · " + article.title);
      return generateQuestSummary(article, options);
    }));

    for (let index = 0; index < prepared.length; index += 1) {
      const job = prepared[index];
      const result = generated[index];
      if (job === undefined || result === undefined) continue;
      if (result.status === "rejected") {
        const failure = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        failures.push(new Error(job.target.questKey + " · " + job.article.title + ": " + failure.message, { cause: failure }));
        console.error("[summary] failed " + job.target.questKey + " · " + job.article.title + " · " + failure.message);
        continue;
      }
      const enrichedContent = await resolveQuestGuideItems(result.value.content, options);
      const enrichedBestiary = await enrichBestiary(enrichedContent, bestiary, options);
      const summary: QuestGuideSummary = {
        questKey: job.target.questKey,
        sourceUrl: job.article.sourceUrl,
        sourceTitle: job.article.title,
        sourceHash: job.article.sourceHash,
        generatedAt: new Date().toISOString(),
        model: result.value.model,
        ...enrichedContent,
        ...(enrichedBestiary === undefined ? {} : { bestiary: enrichedBestiary }),
      };
      byUrl.set(job.url.toString(), summary);
      await writeArchive();
      console.info("[summary] saved " + job.target.questKey + " · " + job.article.title);
    }
  }

  if (failures.length > 0) throw new AggregateError(failures, String(failures.length) + " quest summaries failed; successful results were saved");

  return { version: 1, updatedAt: new Date().toISOString(), summaries: [...byUrl.values()] };
}
