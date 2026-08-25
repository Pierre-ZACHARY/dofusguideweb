import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GuideElement } from "../../src/types/dofusGuide.js";
import { deriveGuideStructure } from "../../src/normalizer/guideStructure.js";

async function step(number: number): Promise<GuideElement[]> {
  return JSON.parse(await readFile(path.resolve("data/raw/guides/-1/steps", String(number).padStart(4, "0") + ".json"), "utf8")) as GuideElement[];
}

describe("real archived data", () => {
  it("couvre les steps de référence sans muter les archives", async () => {
    const samples = await Promise.all([1, 18, 28, 37, 54].map(step));
    expect(new Set(samples.flat().map((element) => element.type))).toEqual(expect.objectContaining(new Set(["TEXTE", "HTML", "IMAGE", "ITEMS", "QUEST", "QUEST_START", "QUEST_FINISH", "DUNGEON"])));
    expect(samples[2]?.some((element) => element.type === "QUEST_START")).toBe(true);
    expect(samples[4]?.some((element) => element.type === "DUNGEON")).toBe(true);
  });

  it("retrouve les 32 chapitres et le niveau 200 conservateur", async () => {
    const steps = await Promise.all(Array.from({ length: 326 }, async (_, index) => ({ stepNumber: index + 1, elements: await step(index + 1) })));
    const structure = deriveGuideStructure(steps);
    expect(structure.chapters).toHaveLength(32);
    expect(structure.chapters.at(-1)).toMatchObject({ chapterNumber: 32, recommendedLevelMin: 200, recommendedLevelMax: 200, endStep: 326 });
    expect(structure.steps.find((item) => item.stepNumber === 111)).toMatchObject({ chapterNumber: 8, recommendedLevelMin: 105, recommendedLevelMax: 110 });
  });
});
