import type { GuideElement } from "../types/dofusGuide.js";

export const KNOWN_GUIDE_ELEMENT_TYPES = [
  "IMAGE",
  "TEXTE",
  "QUEST_START",
  "QUEST",
  "QUEST_FINISH",
  "ITEMS",
  "HTML",
  "DUNGEON",
  "TRAVEL",
  "MONSTER",
  "CAC",
  "LIEN",
] as const;

export type KnownGuideElementType = (typeof KNOWN_GUIDE_ELEMENT_TYPES)[number];
export type GuideElementClassification = KnownGuideElementType | "UNKNOWN";

export interface ChapterMarker {
  chapterNumber: number;
  chapterName: string;
  rawTitle: string;
}

export interface RecommendedLevelRange {
  min: number;
  max: number;
  rawLabel: string;
}

export interface VisuallyOrderedElement {
  element: GuideElement;
  sourceOrder: number;
  visualOrder: number;
}

const knownTypeSet = new Set<string>(KNOWN_GUIDE_ELEMENT_TYPES);

export function classifyGuideElementType(type: string): GuideElementClassification {
  return knownTypeSet.has(type) ? (type as KnownGuideElementType) : "UNKNOWN";
}

export function stripDofusMarkup(value: string): string {
  return value.replace(/<\/?fc(?:=[^>]*)?>/giu, "");
}

export function extractChapterMarker(value: string): ChapterMarker | null {
  const rawTitle = stripDofusMarkup(value).trim();
  const match = /^(\d+)\.\s*(\S(?:.*\S)?)$/u.exec(rawTitle);
  if (!match) {
    return null;
  }

  const chapterNumber = Number(match[1]);
  const chapterName = match[2];
  if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1 || chapterName === undefined) {
    return null;
  }

  return { chapterNumber, chapterName, rawTitle };
}

export function extractRecommendedLevelRange(value: string): RecommendedLevelRange | null {
  const text = stripDofusMarkup(value).replace(/\s+/gu, " ").trim();
  const range = /\blvl\s*(\d+)\s*(?:à|a|->|–|—|-)\s*(\d+)\b/iu.exec(text);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isSafeInteger(min) && Number.isSafeInteger(max) && min <= max) {
      return { min, max, rawLabel: range[0] };
    }
    return null;
  }

  const single = /\blvl\s*(\d+)\b/iu.exec(text);
  if (!single) {
    return null;
  }
  const level = Number(single[1]);
  return Number.isSafeInteger(level)
    ? { min: level, max: level, rawLabel: single[0] }
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positionCoordinate(element: GuideElement, key: "pos_x" | "pos_y"): number {
  if (typeof element.pos !== "object" || element.pos === null) {
    return Number.POSITIVE_INFINITY;
  }
  return finiteNumber((element.pos as unknown as Record<string, unknown>)[key]) ?? Number.POSITIVE_INFINITY;
}

export function orderGuideElementsVisually(elements: readonly GuideElement[]): VisuallyOrderedElement[] {
  return elements
    .map((element, sourceOrder) => ({ element, sourceOrder }))
    .sort((left, right) => {
      const byY = positionCoordinate(left.element, "pos_y") - positionCoordinate(right.element, "pos_y");
      if (byY !== 0) return byY;
      const byX = positionCoordinate(left.element, "pos_x") - positionCoordinate(right.element, "pos_x");
      return byX !== 0 ? byX : left.sourceOrder - right.sourceOrder;
    })
    .map((entry, visualOrder) => ({ ...entry, visualOrder }));
}
