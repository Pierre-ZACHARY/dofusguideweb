export type GuideRelation = "START" | "ACTIVE" | "FINISH" | "UNKNOWN";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface GuideSummaryDto {
  id: number;
  name: string;
  author: string | null;
  imageUrl: string | null;
  totalSteps: number;
  totalChapters: number;
}

export interface ChapterDto {
  id: number;
  chapterNumber: number;
  name: string;
  levelMin: number | null;
  levelMax: number | null;
  startStep: number;
  endStep: number;
}

export interface StepSummaryDto {
  stepNumber: number;
  chapterId: number | null;
  title: string | null;
  levelMin: number | null;
  levelMax: number | null;
}

export interface DofusProgressDto {
  tag: string;
  itemId: number;
  level: number | null;
  name: string;
  description: string;
  imageUrl: string | null;
  quests: Array<{ questKey: string; completionStep: number }>;
}

export interface WorldTourDungeonDto {
  order: number;
  achievementId: number;
  questId: number;
  questName: string;
  questStepId: number;
  dungeonId: number;
  dungeonName: string;
  bossId: number;
  bossName: string;
  bossLevel: number;
  bossLifePoints: number;
  bossImageUrl: string | null;
  guideStep: number | null;
  dofusPourLesNoobsUrl: string | null;
}

export interface WorldTourTrackDto {
  id: "metag-robill" | "emma-tompouce";
  name: string;
  achievementIds: number[];
  dungeons: WorldTourDungeonDto[];
}

export interface QuestDto {
  questKey: string;
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
}

export interface QuestGuideSummaryDto {
  sourceUrl: string;
  sourceTitle: string;
  overview: string;
  recommendedLevel: number | null;
  prerequisites: string[];
  rewards: string[];
  preparation: string[];
  actions: Array<{ instruction: string; position: string | null; zoneHint?: string | null | undefined; warning: string | null; combat: "NONE" | "SOLO" | "GROUP" | "CHOICE" }>;
  notes: string[];
  npcs: string[];
  items: Array<{ name: string; itemId: number | null; imageUrl: string | null; dofusDbUrl: string | null }>;
  bestiary?: {
    zones: Array<{ id: number; name: string; coordinates: string[] }>;
    bounties: BestiaryMonsterDto[];
    archmonsters: BestiaryMonsterDto[];
    achievements: Array<{ id: number; name: string; monsters: BestiaryMonsterDto[] }>;
  };
}

export interface BestiaryMonsterDto {
  id: number;
  name: string;
  level: number;
  imageUrl: string | null;
}

export interface StepQuestDto extends QuestDto {
  relation: GuideRelation;
  sortOrder: number;
  value: JsonValue;
  guideSummary?: QuestGuideSummaryDto | null;
}

export interface GuideElementDto {
  id: number;
  remoteId: number;
  type: string;
  sourceOrder: number;
  visualOrder: number;
  position: { x: number | null; y: number | null; width: number | null; height: number | null };
  font: JsonValue;
  value: JsonValue;
  raw?: JsonValue;
  resolvedChallenges?: ResolvedChallengeDto[];
}

export interface ResolvedChallengeDto {
  successId: string;
  challengeId: number | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface BreedDto {
  id: number;
  name: string;
  gameplay: string | null;
  imageUrl: string | null;
}

export interface StepDetailDto {
  guide: GuideSummaryDto;
  chapter: ChapterDto | null;
  chapterSteps: StepSummaryDto[];
  stepNumber: number;
  totalSteps: number;
  title: string | null;
  levelMin: number | null;
  levelMax: number | null;
  previousStep: number | null;
  nextStep: number | null;
  elements: GuideElementDto[];
  quests: StepQuestDto[];
  breeds: BreedDto[];
}
