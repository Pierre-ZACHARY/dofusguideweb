import type { GuideElement } from "../types/dofusGuide.js";
import { extractQuestOccurrences } from "./quests.js";
import type {
  NormalizedGuideElement,
  NormalizedGuideStep,
  NormalizedQuestOccurrence,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeElement(
  guideId: number,
  stepNumber: number,
  element: GuideElement,
  sortOrder: number,
): NormalizedGuideElement {
  const position = isRecord(element.pos) ? element.pos : undefined;
  return {
    remoteId: element.id,
    guideId,
    stepNumber,
    sortOrder,
    elementType: element.type,
    positionX: optionalNumber(position?.pos_x),
    positionY: optionalNumber(position?.pos_y),
    width: optionalNumber(position?.largeur),
    height: optionalNumber(position?.hauteur),
    rawValue: element.valeur,
    rawElement: element,
  };
}

function findStepTitle(elements: GuideElement[]): string | null {
  for (const element of elements) {
    if (element.type === "TEXTE" && typeof element.valeur === "string") {
      const title = element.valeur.trim();
      if (title !== "") {
        return title;
      }
    }
  }
  return null;
}

export function normalizeGuideStep(
  guideId: number,
  stepNumber: number,
  elements: GuideElement[],
): NormalizedGuideStep {
  const normalizedElements = elements.map((element, sortOrder) =>
    normalizeElement(guideId, stepNumber, element, sortOrder),
  );
  const quests: NormalizedQuestOccurrence[] = [];

  for (const [sourceElementOrder, element] of elements.entries()) {
    const occurrences = extractQuestOccurrences({
      guideId,
      stepNumber,
      element,
      sourceElementOrder,
      firstSortOrder: quests.length,
    });
    quests.push(...occurrences);
  }

  return {
    guideId,
    stepNumber,
    title: findStepTitle(elements),
    recommendedLevelMin: null,
    recommendedLevelMax: null,
    elements: normalizedElements,
    quests,
  };
}
