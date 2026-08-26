import { afterAll, describe, expect, it } from "vitest";
import type { GuideElement } from "../../src/types/dofusGuide.js";
import { deriveGuideStructure } from "../../src/normalizer/guideStructure.js";
import { SqliteDofusGuideRepository } from "../../src/repositories/sqliteDofusGuideRepository.js";

const repository = new SqliteDofusGuideRepository("data/dofusguide.sqlite");

afterAll(() => repository.close());

function step(number: number): GuideElement[] {
  const archivedStep = repository.getGuideStep(-1, number);
  if (archivedStep === undefined) throw new Error(`Missing archived guide step ${number}`);
  return archivedStep.raw as GuideElement[];
}

describe("real archived data", () => {
  it("couvre les steps de référence sans muter les archives", () => {
    const samples = [1, 18, 28, 37, 54].map(step);
    expect(new Set(samples.flat().map((element) => element.type))).toEqual(expect.objectContaining(new Set(["TEXTE", "HTML", "IMAGE", "ITEMS", "QUEST", "QUEST_START", "QUEST_FINISH", "DUNGEON"])));
    expect(samples[2]?.some((element) => element.type === "QUEST_START")).toBe(true);
    expect(samples[4]?.some((element) => element.type === "DUNGEON")).toBe(true);
  });

  it("retrouve les 32 chapitres et le niveau 200 conservateur", () => {
    const steps = Array.from({ length: 326 }, (_, index) => ({ stepNumber: index + 1, elements: step(index + 1) }));
    const structure = deriveGuideStructure(steps);
    expect(structure.chapters).toHaveLength(32);
    expect(structure.chapters.at(-1)).toMatchObject({ chapterNumber: 32, recommendedLevelMin: 200, recommendedLevelMax: 200, endStep: 326 });
    expect(structure.steps.find((item) => item.stepNumber === 111)).toMatchObject({ chapterNumber: 8, recommendedLevelMin: 105, recommendedLevelMax: 110 });
  });
});
