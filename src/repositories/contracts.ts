export interface GuideRecord {
  id: number;
  name: string;
  author: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  remoteUpdatedAt: string | null;
  scrapedAt: string;
  raw: unknown;
}

export interface GuideChapterRecord {
  id: number;
  guideId: number;
  chapterNumber: number;
  name: string;
  rawTitle: string;
  recommendedLevelMin: number | null;
  recommendedLevelMax: number | null;
  startStep: number;
  endStep: number;
}

export interface GuideStepSummaryRecord {
  id: number;
  guideId: number;
  chapterId: number | null;
  stepNumber: number;
  recommendedLevelMin: number | null;
  recommendedLevelMax: number | null;
  title: string | null;
}

export interface QuestRecord {
  id: number;
  questKey: string;
  sourceQuestKey: string | null;
  originalName: string | null;
  normalizedName: string | null;
  sequenceNumber: number | null;
  externalUrl: string | null;
  category: string | null;
  npcName: string | null;
  npcImageUrl: string | null;
  startX: number | null;
  startY: number | null;
  startMap: string | null;
  travelCommand: string | null;
  rawValue: unknown;
}

export interface GuideElementRecord {
  id: number;
  remoteId: number;
  sortOrder: number;
  elementType: string;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  height: number | null;
  rawValue: unknown;
  rawElement: unknown;
}

export interface StepQuestRecord extends QuestRecord {
  relationType: string;
  sortOrder: number;
}

export interface GuideStepRecord extends Omit<GuideStepSummaryRecord, "chapterId"> {
  chapterId?: number | null;
  raw: unknown;
  elements: GuideElementRecord[];
  quests: StepQuestRecord[];
}

export interface QuestStepRecord {
  guideId: number;
  guideName: string;
  stepNumber: number;
  stepTitle: string | null;
  relationType: string;
  sortOrder: number;
}

export interface GuideQuestOccurrenceRecord {
  questKey: string;
  stepNumber: number;
  relationType: string;
  rawValue: unknown;
}

export interface SearchQuestOptions {
  q?: string;
  guideId?: number;
  stepMin?: number;
  stepMax?: number;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedQuests {
  items: QuestRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface GuideRepository {
  listGuides(): GuideRecord[];
  getGuide(id: number): GuideRecord | undefined;
  getGuideStep(guideId: number, stepNumber: number): GuideStepRecord | undefined;
  listGuideChapters(guideId: number): GuideChapterRecord[];
  listGuideSteps(guideId: number): GuideStepSummaryRecord[];
}

export interface QuestRepository {
  searchQuests(options?: SearchQuestOptions): PaginatedQuests;
  getQuest(questKey: string): QuestRecord | undefined;
  getQuestSteps(questKey: string): QuestStepRecord[] | undefined;
  listGuideQuestOccurrences(guideId: number): GuideQuestOccurrenceRecord[];
}

export interface DofusGuideRepository extends GuideRepository, QuestRepository {
  readonly databasePath: string;
  close(): void;
}
