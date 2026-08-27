import { loadResolvedBreeds } from "../../breeds/resolveBreeds.js";
import { resolveDungeonChallenges } from "../../challenges/resolveChallenges.js";
import { firstTaggedQuestAppearances, groupTaggedQuestCompletions, sortDofusByLevelAndAppearance } from "../../dofus/questProgress.js";
import { loadResolvedDofus } from "../../dofus/resolveDofus.js";
import { loadQuestGuideStepArchive } from "../../questGuides/resolveQuestGuides.js";
import type { DofusGuideRepository, GuideRecord, QuestRecord } from "../../repositories/contracts.js";
import { orderGuideElementsVisually } from "../../shared/guideAnalysis.js";
import type { GuideElement } from "../../types/dofusGuide.js";
import { loadWorldTour } from "../../worldTour/resolveWorldTour.js";
import type { ChapterDto, GuideSummaryDto, JsonValue, QuestDto } from "./models.js";

export interface QuestSearchDataInput {
  q?: string | undefined;
  guideId?: number | undefined;
  stepMin?: number | undefined;
  stepMax?: number | undefined;
  type?: string | undefined;
  page: number;
  limit: number;
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

function guideSummary(repository: DofusGuideRepository, guide: GuideRecord): GuideSummaryDto {
  return {
    id: guide.id,
    name: guide.name,
    author: guide.author,
    imageUrl: guide.imageUrl,
    totalSteps: repository.listGuideSteps(guide.id).filter((step) => step.title !== null).length,
    totalChapters: repository.listGuideChapters(guide.id).length,
  };
}

function chapters(repository: DofusGuideRepository, guideId: number): ChapterDto[] {
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

export function loadHomeData(repository: DofusGuideRepository) {
  const guide = repository.listGuides()[0];
  if (guide === undefined) return { guide: null, firstStep: null };
  const steps = repository.listGuideSteps(guide.id).filter((step) => step.title !== null);
  return { guide: guideSummary(repository, guide), firstStep: steps[0]?.stepNumber ?? null };
}

export function loadGuidesData(repository: DofusGuideRepository): GuideSummaryDto[] {
  return repository.listGuides().map((guide) => guideSummary(repository, guide));
}

export async function loadGuideData(repository: DofusGuideRepository, guideId: number) {
  const guide = repository.getGuide(guideId);
  if (guide === undefined) return null;
  const questOccurrences = repository.listGuideQuestOccurrences(guide.id);
  const completions = groupTaggedQuestCompletions(questOccurrences);
  const firstAppearances = firstTaggedQuestAppearances(questOccurrences);
  const [resolvedDofus, worldTour] = await Promise.all([loadResolvedDofus(), loadWorldTour()]);
  const dofus = sortDofusByLevelAndAppearance(resolvedDofus.flatMap((item) => {
    const questsForTag = completions.get(item.tag);
    return questsForTag === undefined ? [] : [{ ...item, quests: questsForTag }];
  }), firstAppearances);
  return {
    guide: guideSummary(repository, guide),
    chapters: chapters(repository, guide.id),
    steps: repository.listGuideSteps(guide.id).filter((step) => step.title !== null).map((step) => {
      const detail = repository.getGuideStep(guide.id, step.stepNumber);
      return {
        stepNumber: step.stepNumber,
        chapterId: step.chapterId,
        title: step.title,
        levelMin: step.recommendedLevelMin,
        levelMax: step.recommendedLevelMax,
        quests: detail?.quests.map((quest) => ({
          questKey: quest.questKey,
          relation: quest.relationType as "START" | "ACTIVE" | "FINISH" | "UNKNOWN",
          sortOrder: quest.sortOrder,
        })) ?? [],
      };
    }),
    dofus,
    worldTour: worldTour?.tracks ?? [],
  };
}

export async function loadStepData(repository: DofusGuideRepository, guideId: number, stepNumber: number) {
  const guide = repository.getGuide(guideId);
  const step = repository.getGuideStep(guideId, stepNumber);
  if (guide === undefined || step === undefined) return null;
  const stepList = repository.listGuideSteps(guide.id).filter((item) => item.title !== null);
  const index = stepList.findIndex((item) => item.stepNumber === step.stepNumber);
  const chapterList = chapters(repository, guide.id);
  const summary = stepList[index];
  const chapter = chapterList.find((item) => item.id === summary?.chapterId) ?? null;
  const ordered = orderGuideElementsVisually(step.elements.map((element) => element.rawElement as GuideElement));
  const visualOrders = new Map(ordered.map((entry) => [entry.sourceOrder, entry.visualOrder]));
  const visibleElements = step.elements
    .map((element, sourceOrder) => {
      const raw = typeof element.rawElement === "object" && element.rawElement !== null
        ? element.rawElement as Record<string, unknown>
        : {};
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
    })
    .filter((element) => !(element.type === "CAC" && typeof element.value === "string" && /^cac:\d+$/i.test(element.value.trim())));
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
  const questGuideStep = await loadQuestGuideStepArchive(guideId, stepNumber);
  const quests = await Promise.all(step.quests.map(async (quest) => {
    const questSummary = questGuideStep?.summaries.find((candidate) => candidate.questKey === quest.questKey) ?? null;
    return {
      ...questDto(quest),
      relation: quest.relationType as "START" | "ACTIVE" | "FINISH" | "UNKNOWN",
      sortOrder: quest.sortOrder,
      value: jsonValue(quest.rawValue),
      guideSummary: questSummary === null ? null : {
        sourceUrl: questSummary.sourceUrl,
        sourceTitle: questSummary.sourceTitle,
        overview: questSummary.overview,
        recommendedLevel: questSummary.recommendedLevel,
        prerequisites: questSummary.prerequisites,
        rewards: questSummary.rewards,
        preparation: questSummary.preparation,
        actions: questSummary.actions,
        notes: questSummary.notes,
        npcs: questSummary.npcs,
        items: questSummary.items,
        bestiary: questSummary.bestiary ?? { zones: [], bounties: [], archmonsters: [], achievements: [] },
      },
    };
  }));
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
    elements,
    quests,
    tips: questGuideStep?.tips ?? [],
    breeds: await loadResolvedBreeds(),
  };
}

export function loadQuestSearchData(repository: DofusGuideRepository, data: QuestSearchDataInput) {
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
}

export function loadQuestData(repository: DofusGuideRepository, questKey: string) {
  const quest = repository.getQuest(questKey);
  const steps = repository.getQuestSteps(questKey);
  return quest === undefined || steps === undefined
    ? null
    : { quest: { ...questDto(quest), value: jsonValue(quest.rawValue) }, steps };
}
