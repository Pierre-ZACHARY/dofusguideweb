import type { GuideElement } from "../types/dofusGuide.js";
import { parseQuestName } from "./names.js";
import type {
  NormalizedQuest,
  NormalizedQuestOccurrence,
  QuestRelationType,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseQuestValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(parseQuestValues);
  }
  if (typeof value === "string") {
    try {
      return parseQuestValues(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return isRecord(value) ? [value] : [];
}

function canonicalQuestKey(sourceKey: string): string {
  const startMatch = /^quest_start:(.+)$/iu.exec(sourceKey);
  return startMatch?.[1] === undefined ? sourceKey : `quest:${startMatch[1]}`;
}

function parseCoordinates(value: unknown): { x: number; y: number } | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /(-?\d+)\s*(?:,|\s)\s*(-?\d+)/u.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function relationTypeForElement(elementType: string): QuestRelationType {
  switch (elementType) {
    case "QUEST_START":
      return "START";
    case "QUEST":
      return "ACTIVE";
    case "QUEST_FINISH":
      return "FINISH";
    default:
      return "UNKNOWN";
  }
}

export interface ExtractQuestOptions {
  guideId: number;
  stepNumber: number;
  element: GuideElement;
  sourceElementOrder: number;
  firstSortOrder?: number;
}

export function extractQuestOccurrences(
  options: ExtractQuestOptions,
): NormalizedQuestOccurrence[] {
  const relationType = relationTypeForElement(options.element.type);
  if (relationType === "UNKNOWN") {
    return [];
  }

  return parseQuestValues(options.element.valeur).map((rawValue, sourceValueOrder) => {
    const value = rawValue as Record<string, unknown>;
    const sourceQuestKeyValue = value.id;
    const sourceQuestKey =
      typeof sourceQuestKeyValue === "string" || typeof sourceQuestKeyValue === "number"
        ? String(sourceQuestKeyValue)
        : null;
    const questKey =
      sourceQuestKey === null
        ? `synthetic:${options.guideId}:${options.stepNumber}:${options.element.id}:${sourceValueOrder}`
        : canonicalQuestKey(sourceQuestKey);
    const originalName = optionalString(value.name);
    const parsedName = originalName === null ? null : parseQuestName(originalName);
    const positionStart = isRecord(value.position_start) ? value.position_start : undefined;
    const travelCommand = optionalString(positionStart?.cmd);
    const coordinates =
      parseCoordinates(positionStart?.position) ?? parseCoordinates(travelCommand);

    const quest: NormalizedQuest = {
      questKey,
      sourceQuestKey,
      originalName,
      normalizedName: parsedName?.normalizedName ?? null,
      sequenceNumber: parsedName?.sequenceNumber ?? null,
      externalUrl: optionalString(value.link),
      category: optionalString(value.type),
      npcName: optionalString(value.name_pnj),
      npcImageUrl: optionalString(value.pnj_image),
      startX: coordinates?.x ?? null,
      startY: coordinates?.y ?? null,
      startMap: optionalString(positionStart?.map),
      travelCommand,
      rawValue,
    };

    return {
      quest,
      relationType,
      sortOrder: (options.firstSortOrder ?? 0) + sourceValueOrder,
      sourceElementOrder: options.sourceElementOrder,
      sourceValueOrder,
    };
  });
}
