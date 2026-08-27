import { describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { loadQuestGuideStepArchive, loadQuestGuideSummaries } from "../../src/questGuides/resolveQuestGuides.js";

describe("versioned quest guide summaries", () => {
  it("ships AI tutorials and their bestiary enrichment with the application", async () => {
    const stepFiles = (await readdir("data/generated/quest-summaries/-1")).filter((file) => file.endsWith(".json"));
    const summaries = [...(await loadQuestGuideSummaries()).values()];

    expect(stepFiles).toHaveLength(326);
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.some((summary) => summary.actions.length > 0)).toBe(true);
    expect(summaries.some((summary) => {
      const bestiary = summary.bestiary;
      return bestiary !== undefined
        && (bestiary.bounties.length > 0
          || bestiary.archmonsters.length > 0
          || bestiary.achievements.some((achievement) => achievement.monsters.length > 0));
    })).toBe(true);

    const technicalTipReferences: string[] = [];
    for (const stepFile of stepFiles) {
      const stepNumber = Number.parseInt(stepFile, 10);
      const archive = await loadQuestGuideStepArchive(-1, stepNumber);
      for (const [tipIndex, tip] of (archive?.tips ?? []).entries()) {
        const prose = [tip.title, tip.description, ...tip.actions];
        if (prose.some((value) => /\bquest:\d+\b/u.test(value))) {
          technicalTipReferences.push(stepFile + "#tip-" + tipIndex);
        }
      }
    }
    expect(technicalTipReferences).toEqual([]);
  });
});
