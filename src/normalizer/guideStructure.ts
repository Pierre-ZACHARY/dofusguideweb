import type { GuideElement } from "../types/dofusGuide.js";
import { extractChapterMarker, extractRecommendedLevelRange } from "../shared/guideAnalysis.js";

export interface SourceStep {
  stepNumber: number;
  elements: GuideElement[];
}

export interface DerivedChapter {
  chapterNumber: number;
  name: string;
  rawTitle: string;
  recommendedLevelMin: number | null;
  recommendedLevelMax: number | null;
  startStep: number;
  endStep: number;
}

export interface DerivedStepStructure {
  stepNumber: number;
  chapterNumber: number | null;
  recommendedLevelMin: number | null;
  recommendedLevelMax: number | null;
}

function textValues(elements: readonly GuideElement[]): string[] {
  return elements.flatMap((element) =>
    (element.type === "TEXTE" || element.type === "HTML") && typeof element.valeur === "string"
      ? [element.valeur]
      : [],
  );
}

export function deriveGuideStructure(steps: readonly SourceStep[]): {
  chapters: DerivedChapter[];
  steps: DerivedStepStructure[];
} {
  const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const chapters: DerivedChapter[] = [];
  const derivedSteps: DerivedStepStructure[] = [];
  let currentChapter: DerivedChapter | null = null;

  for (const step of ordered) {
    const values = textValues(step.elements);
    const marker = values.map(extractChapterMarker).find((value) => value !== null) ?? null;
    const level = values.map(extractRecommendedLevelRange).find((value) => value !== null) ?? null;

    if (marker !== null && chapters.at(-1)?.chapterNumber !== marker.chapterNumber) {
      if (currentChapter !== null) currentChapter.endStep = step.stepNumber - 1;
      currentChapter = {
        chapterNumber: marker.chapterNumber,
        name: marker.chapterName,
        rawTitle: marker.rawTitle,
        recommendedLevelMin: level?.min ?? null,
        recommendedLevelMax: level?.max ?? null,
        startStep: step.stepNumber,
        endStep: step.stepNumber,
      };
      chapters.push(currentChapter);
    }

    if (currentChapter !== null && level !== null) {
      currentChapter.recommendedLevelMin ??= level.min;
      currentChapter.recommendedLevelMax ??= level.max;
    }
    if (currentChapter !== null && step.elements.length > 0) currentChapter.endStep = step.stepNumber;

    derivedSteps.push({
      stepNumber: step.stepNumber,
      chapterNumber: step.elements.length === 0 ? null : currentChapter?.chapterNumber ?? null,
      recommendedLevelMin: level?.min ?? null,
      recommendedLevelMax: level?.max ?? null,
    });
  }

  return { chapters, steps: derivedSteps };
}
