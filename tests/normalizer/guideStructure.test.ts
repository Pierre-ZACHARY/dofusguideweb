import { describe, expect, it } from "vitest";
import type { GuideElement } from "../../src/types/dofusGuide.js";
import { deriveGuideStructure } from "../../src/normalizer/guideStructure.js";

function text(step: number, value: string): GuideElement {
  return { id: step, tuto_id: -1, name: "Guide", etape: step, type: "TEXTE", valeur: value };
}

describe("deriveGuideStructure", () => {
  it("fusionne les en-têtes répétés et propage le chapitre, pas les niveaux absents", () => {
    const structure = deriveGuideStructure([
      { stepNumber: 1, elements: [text(1, "1. Incarnam"), text(1, "lvl 1 à 20")] },
      { stepNumber: 2, elements: [text(2, "1. Incarnam")] },
      { stepNumber: 3, elements: [text(3, "2. Astrub"), text(3, "lvl 20 à 50")] },
      { stepNumber: 4, elements: [] },
    ]);

    expect(structure.chapters).toEqual([
      expect.objectContaining({ chapterNumber: 1, startStep: 1, endStep: 2, recommendedLevelMin: 1, recommendedLevelMax: 20 }),
      expect.objectContaining({ chapterNumber: 2, startStep: 3, endStep: 3, recommendedLevelMin: 20, recommendedLevelMax: 50 }),
    ]);
    expect(structure.steps.map(({ chapterNumber }) => chapterNumber)).toEqual([1, 1, 2, null]);
    expect(structure.steps[1]).toMatchObject({ recommendedLevelMin: null, recommendedLevelMax: null });
  });
});
