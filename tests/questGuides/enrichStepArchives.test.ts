import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DofusGuideRepository, GuideStepRecord } from "../../src/repositories/contracts.js";
import { cacheSourceArticle } from "../../src/questGuides/dplnArticleCache.js";
import { enrichStepArchives, resolveQuestTipReferences } from "../../src/questGuides/enrichStepArchives.js";
import { questGuideStepPath } from "../../src/questGuides/resolveQuestGuides.js";
import { atomicWriteFile } from "../../src/utils/fs.js";

describe("enrichStepArchives", () => {
  it("replaces technical quest keys in tip prose with local quest names", () => {
    const quests = new Map([
      ["quest:1211", { originalName: "L'histoire en mouvement" }],
      ["quest:1184", { originalName: "Ça sent le gaz" }],
    ]);
    const resolved = resolveQuestTipReferences({
      title: "Faire quest:1211 et quest:1184 ensemble",
      description: "Commencez quest:1211 avant quest:1184.",
      questKeys: ["quest:1211", "quest:1184"],
      actions: ["Pour quest:1211, parlez à Aisling.", "Terminez quest:1184."],
    }, { getQuest: (questKey) => quests.get(questKey) } as Pick<DofusGuideRepository, "getQuest">);

    expect(resolved.replacements).toBe(6);
    expect(resolved.tip).toMatchObject({
      title: "Faire L'histoire en mouvement et Ça sent le gaz ensemble",
      description: "Commencez L'histoire en mouvement avant Ça sent le gaz.",
      questKeys: ["quest:1211", "quest:1184"],
      actions: ["Pour L'histoire en mouvement, parlez à Aisling.", "Terminez Ça sent le gaz."],
    });
  });

  it("repairs source metadata and enriches items before an atomic validated write", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dofusguide-enrichment-"));
    const input = path.join(root, "summaries");
    const cache = path.join(root, "cache");
    const items = path.join(root, "items");
    const catalog = path.join(root, "bestiary.json");
    const sourceUrl = "https://www.dofuspourlesnoobs.com/quete-test.html";
    const step: GuideStepRecord = {
      id: 9, guideId: -1, stepNumber: 9, chapterId: 1, title: "1. Débuts à Incarnam", recommendedLevelMin: 1, recommendedLevelMax: 1,
      raw: [], elements: [], quests: [{
        id: 1, questKey: "quest:1", sourceQuestKey: null, originalName: "Quête test", normalizedName: "quete test",
        sequenceNumber: null, externalUrl: sourceUrl, category: null, npcName: null, npcImageUrl: null,
        startX: null, startY: null, startMap: null, travelCommand: null, rawValue: {}, relationType: "ACTIVE", sortOrder: 0,
      }],
    };
    const repository = {
      listGuideSteps: () => [step],
      getGuideStep: () => step,
    } as unknown as DofusGuideRepository;
    const rawArchive = {
      version: 2, guideId: -1, stepNumber: 9, updatedAt: null, tips: [], summaries: [{
        questKey: "quest:1", sourceUrl: "[https://invalid.example", sourceTitle: "Titre](https://invalid.example)",
        sourceHash: "0".repeat(64), generatedAt: null, model: null,
        overview: "Résumé", recommendedLevel: 1, prerequisites: [], rewards: [], preparation: [],
        actions: [{ instruction: "Aller en [1,2].", position: "[1,2]", zoneHint: null, warning: null, combat: "NONE" }],
        notes: [], npcs: [], items: [{ name: "Objet test", itemId: null, imageUrl: null, dofusDbUrl: null }],
      }],
    };
    const itemFetch = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return url.pathname.startsWith("/img/")
        ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })
        : Response.json({ data: [{ id: 42, iconId: 84, name: { fr: "Objet test" } }] });
    });

    try {
      await atomicWriteFile(questGuideStepPath(-1, 9, input), Buffer.from(JSON.stringify(rawArchive), "utf8"));
      await cacheSourceArticle(cache, { sourceUrl, title: "Quête test", sourceHash: "a".repeat(64), content: "Source" });
      await atomicWriteFile(catalog, Buffer.from(JSON.stringify({
        version: 1, source: "https://api.dofusdb.fr", scrapedAt: "2026-01-01T00:00:00.000Z",
        monsters: [], dungeons: [], achievements: [],
        subareas: [
          { id: 10, areaId: 0, name: "Village d'Amakna", monsterIds: [] },
          { id: 442, areaId: 45, name: "Lac", monsterIds: [] },
        ],
        coordinates: { "1,2": [10, 442] },
      }), "utf8"));

      const result = await enrichStepArchives(repository, {
        guideId: -1, inputDirectory: input, sourceCacheDirectory: cache, bestiaryCatalogPath: catalog,
        publicItemDirectory: items, itemFetch, itemDelayMs: 0,
      });
      const archive = JSON.parse(await readFile(questGuideStepPath(-1, 9, input), "utf8"));
      expect(result).toMatchObject({ filesWritten: 1, summariesProcessed: 1, sourceMetadataRepaired: 1, questReferencesResolved: 0, itemsResolved: 1, unresolvedItems: [] });
      expect(archive.summaries[0]).toMatchObject({
        sourceUrl, sourceTitle: "Quête test", sourceHash: "a".repeat(64),
        items: [{ name: "Objet test", itemId: 42, imageUrl: "/items/42.png", dofusDbUrl: "https://dofusdb.fr/fr/database/item/42" }],
        bestiary: { zones: [{ id: 442, name: "Lac", coordinates: ["1,2"] }], bounties: [], archmonsters: [], achievements: [] },
      });
      expect([...await readFile(path.join(items, "42.png"))]).toEqual([1, 2, 3]);

      const unchanged = await enrichStepArchives(repository, {
        guideId: -1, inputDirectory: input, sourceCacheDirectory: cache, bestiaryCatalogPath: catalog,
        publicItemDirectory: items, itemFetch, itemDelayMs: 0,
      });
      expect(unchanged.filesWritten).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
