import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { orderGuideElementsVisually } from "../../shared/guideAnalysis.js";
import type { GuideElement } from "../../types/dofusGuide.js";
import type { GuideRecord, QuestRecord } from "../../repositories/contracts.js";
import type { ChapterDto, GuideSummaryDto, QuestDto } from "./models.js";
import type { JsonValue } from "./models.js";

const databasePath = () => process.env.DOFUSGUIDE_DB ?? "data/dofusguide.sqlite";

async function withRepository<T>(callback: (repository: import("../../repositories/contracts.js").DofusGuideRepository) => T): Promise<T> {
  const { SqliteDofusGuideRepository } = await import("../../repositories/sqliteDofusGuideRepository.js");
  const repository = new SqliteDofusGuideRepository(databasePath());
  try {
    return callback(repository);
  } finally {
    repository.close();
  }
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function questDto(quest: QuestRecord): QuestDto {
  return {
    questKey: quest.questKey,
    originalName: quest.originalName,
    normalizedName: quest.normalizedName,
    sequenceNumber: quest.sequenceNumber,
    externalUrl: quest.externalUrl,
    category: quest.category,
    npcName: quest.npcName,
    npcImageUrl: quest.npcImageUrl,
    startX: quest.startX,
    startY: quest.startY,
    startMap: quest.startMap,
    travelCommand: quest.travelCommand,
  };
}

function guideSummary(repository: import("../../repositories/contracts.js").DofusGuideRepository, guide: GuideRecord): GuideSummaryDto {
  return {
    id: guide.id,
    name: guide.name,
    author: guide.author,
    imageUrl: guide.imageUrl,
    totalSteps: repository.listGuideSteps(guide.id).filter((step) => step.title !== null).length,
    totalChapters: repository.listGuideChapters(guide.id).length,
  };
}

function chapters(repository: import("../../repositories/contracts.js").DofusGuideRepository, guideId: number): ChapterDto[] {
  return repository.listGuideChapters(guideId).map((chapter) => ({
    id: chapter.id,
    chapterNumber: chapter.chapterNumber,
    name: chapter.name,
    levelMin: chapter.recommendedLevelMin,
    levelMax: chapter.recommendedLevelMax,
    startStep: chapter.startStep,
    endStep: chapter.endStep,
  }));
}

export const getHomeData = createServerFn({ method: "GET" }).handler(() => withRepository((repository) => {
  const guide = repository.listGuides()[0];
  if (guide === undefined) return { guide: null, firstStep: null };
  const steps = repository.listGuideSteps(guide.id).filter((step) => step.title !== null);
  return { guide: guideSummary(repository, guide), firstStep: steps[0]?.stepNumber ?? null };
}));

export const getGuidesData = createServerFn({ method: "GET" }).handler(() => withRepository((repository) =>
  repository.listGuides().map((guide) => guideSummary(repository, guide)),
));

const guideInput = z.object({ guideId: z.number().int() });
export const getGuideData = createServerFn({ method: "GET" }).validator(guideInput).handler(async ({ data }) => {
  const result = await withRepository((repository) => {
    const guide = repository.getGuide(data.guideId);
    if (guide === undefined) return null;
    return {
      guide: guideSummary(repository, guide),
      chapters: chapters(repository, guide.id),
      steps: repository.listGuideSteps(guide.id).filter((step) => step.title !== null).map((step) => ({
        stepNumber: step.stepNumber,
        chapterId: step.chapterId,
        title: step.title,
        levelMin: step.recommendedLevelMin,
        levelMax: step.recommendedLevelMax,
      })),
      questOccurrences: repository.listGuideQuestOccurrences(guide.id),
    };
  });
  if (result === null) return null;
  const [{ loadResolvedDofus }, { firstTaggedQuestAppearances, groupTaggedQuestCompletions, sortDofusByLevelAndAppearance }, { loadWorldTour }] = await Promise.all([
    import("../../dofus/resolveDofus.js"),
    import("../../dofus/questProgress.js"),
    import("../../worldTour/resolveWorldTour.js"),
  ]);
  const completions = groupTaggedQuestCompletions(result.questOccurrences);
  const firstAppearances = firstTaggedQuestAppearances(result.questOccurrences);
  const dofus = sortDofusByLevelAndAppearance((await loadResolvedDofus()).flatMap((item) => {
    const questsForTag = completions.get(item.tag);
    return questsForTag === undefined ? [] : [{ ...item, quests: questsForTag }];
  }), firstAppearances);
  const worldTour = await loadWorldTour();
  const { questOccurrences: _questOccurrences, ...guideData } = result;
  return { ...guideData, dofus, worldTour: worldTour?.tracks ?? [] };
});

const stepInput = z.object({ guideId: z.number().int(), stepNumber: z.number().int().positive() });
export const getStepData = createServerFn({ method: "GET" }).validator(stepInput).handler(async ({ data }) => {
  const result = await withRepository((repository) => {
  const guide = repository.getGuide(data.guideId);
  const step = repository.getGuideStep(data.guideId, data.stepNumber);
  if (guide === undefined || step === undefined) return null;
  const stepList = repository.listGuideSteps(guide.id).filter((item) => item.title !== null);
  const index = stepList.findIndex((item) => item.stepNumber === step.stepNumber);
  const chapterList = chapters(repository, guide.id);
  const summary = stepList[index];
  const chapter = chapterList.find((item) => item.id === summary?.chapterId) ?? null;
  const ordered = orderGuideElementsVisually(step.elements.map((element) => element.rawElement as GuideElement));
  const visualOrders = new Map(ordered.map((entry) => [entry.sourceOrder, entry.visualOrder]));
  return {
    guide: guideSummary(repository, guide),
    chapter,
    chapterSteps: chapter === null ? [] : stepList
      .filter((item) => item.chapterId === chapter.id)
      .map((item) => ({
        stepNumber: item.stepNumber,
        chapterId: item.chapterId,
        title: item.title,
        levelMin: item.recommendedLevelMin,
        levelMax: item.recommendedLevelMax,
      })),
    stepNumber: step.stepNumber,
    totalSteps: stepList.length,
    title: step.title,
    levelMin: step.recommendedLevelMin,
    levelMax: step.recommendedLevelMax,
    previousStep: index > 0 ? stepList[index - 1]?.stepNumber ?? null : null,
    nextStep: index >= 0 && index < stepList.length - 1 ? stepList[index + 1]?.stepNumber ?? null : null,
    elements: step.elements.map((element, sourceOrder) => {
      const raw = typeof element.rawElement === "object" && element.rawElement !== null ? element.rawElement as Record<string, unknown> : {};
      return {
        id: element.id,
        remoteId: element.remoteId,
        type: element.elementType,
        sourceOrder,
        visualOrder: visualOrders.get(sourceOrder) ?? sourceOrder,
        position: { x: element.positionX, y: element.positionY, width: element.width, height: element.height },
        font: jsonValue(raw.font),
        value: jsonValue(element.rawValue),
        ...(element.elementType === "UNKNOWN" ? { raw: jsonValue(element.rawElement) } : {}),
      };
    }),
    quests: step.quests.map((quest) => ({ ...questDto(quest), relation: quest.relationType as "START" | "ACTIVE" | "FINISH" | "UNKNOWN", sortOrder: quest.sortOrder, value: jsonValue(quest.rawValue) })),
  };
  });
  if (result === null) return null;
  const { resolveDungeonChallenges } = await import("../../challenges/resolveChallenges.js");
  const { loadResolvedBreeds } = await import("../../breeds/resolveBreeds.js");
  const { resolveQuestGuideSummary } = await import("../../questGuides/resolveQuestGuides.js");
  const visibleElements = result.elements.filter((element) =>
    !(element.type === "CAC" && typeof element.value === "string" && /^cac:\d+$/i.test(element.value.trim())),
  );
  const elements = await Promise.all(visibleElements.map(async (element) => {
    if (element.type !== "DUNGEON" || typeof element.value !== "object" || element.value === null || Array.isArray(element.value)) return element;
    const successes = Array.isArray(element.value.success) ? element.value.success : [];
    const successValues = successes.flatMap((success) => {
      if (typeof success !== "object" || success === null || Array.isArray(success)) return [];
      const name = typeof success.nom === "string" ? success.nom : null;
      if (name === null) return [];
      return [{
        id: typeof success.id === "string" || typeof success.id === "number" ? success.id : null,
        name,
        description: typeof success.description === "string" ? success.description : null,
      }];
    });
    return { ...element, resolvedChallenges: await resolveDungeonChallenges(successValues) };
  }));
  const quests = await Promise.all(result.quests.map(async (quest) => {
    const summary = await resolveQuestGuideSummary(quest.externalUrl);
    return {
      ...quest,
      guideSummary: summary === null ? null : {
        sourceUrl: summary.sourceUrl,
        sourceTitle: summary.sourceTitle,
        overview: summary.overview,
        recommendedLevel: summary.recommendedLevel,
        prerequisites: summary.prerequisites,
        rewards: summary.rewards,
        preparation: summary.preparation,
        actions: summary.actions,
        notes: summary.notes,
        npcs: summary.npcs,
        items: summary.items,
        bestiary: summary.bestiary ?? { zones: [], bounties: [], archmonsters: [], achievements: [] },
      },
    };
  }));
  return { ...result, elements, quests, breeds: await loadResolvedBreeds() };
});

export const questSearchSchema = z.object({
  q: z.string().trim().optional(),
  guideId: z.number().int().optional(),
  stepMin: z.number().int().positive().optional(),
  stepMax: z.number().int().positive().optional(),
  type: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(200).default(24),
});

export const searchQuestsData = createServerFn({ method: "GET" }).validator(questSearchSchema).handler(({ data }) => withRepository((repository) => {
  const result = repository.searchQuests({
    ...(data.q ? { q: data.q } : {}),
    ...(data.guideId === undefined ? {} : { guideId: data.guideId }),
    ...(data.stepMin === undefined ? {} : { stepMin: data.stepMin }),
    ...(data.stepMax === undefined ? {} : { stepMax: data.stepMax }),
    ...(data.type ? { type: data.type } : {}),
    limit: data.limit,
    offset: (data.page - 1) * data.limit,
  });
  return { ...result, items: result.items.map(questDto), page: data.page };
}));

const questInput = z.object({ questKey: z.string().min(1) });
export const getQuestData = createServerFn({ method: "GET" }).validator(questInput).handler(({ data }) => withRepository((repository) => {
  const quest = repository.getQuest(data.questKey);
  const steps = repository.getQuestSteps(data.questKey);
  return quest === undefined || steps === undefined ? null : { quest: { ...questDto(quest), value: jsonValue(quest.rawValue) }, steps };
}));
