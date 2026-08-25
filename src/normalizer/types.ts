import type { GuideElement } from "../types/dofusGuide.js";

export type QuestRelationType = "START" | "ACTIVE" | "FINISH" | "UNKNOWN";

export interface NormalizedGuideElement {
  remoteId: number;
  guideId: number;
  stepNumber: number;
  sortOrder: number;
  elementType: string;
  positionX: number | null;
  positionY: number | null;
  width: number | null;
  height: number | null;
  rawValue: unknown;
  rawElement: GuideElement;
}

export interface NormalizedQuest {
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

export interface NormalizedQuestOccurrence {
  quest: NormalizedQuest;
  relationType: QuestRelationType;
  sortOrder: number;
  sourceElementOrder: number;
  sourceValueOrder: number;
}

export interface NormalizedGuideStep {
  guideId: number;
  stepNumber: number;
  title: string | null;
  recommendedLevelMin: number | null;
  recommendedLevelMax: number | null;
  elements: NormalizedGuideElement[];
  quests: NormalizedQuestOccurrence[];
}
