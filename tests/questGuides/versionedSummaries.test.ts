import { describe, expect, it } from "vitest";
import { loadQuestGuideSummaries } from "../../src/questGuides/resolveQuestGuides.js";

describe("versioned quest guide summaries", () => {
  it("ships AI tutorials and their bestiary enrichment with the application", async () => {
    const summaries = [...(await loadQuestGuideSummaries()).values()];

    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.some((summary) => summary.actions.length > 0)).toBe(true);
    expect(summaries.some((summary) => {
      const bestiary = summary.bestiary;
      return bestiary !== undefined
        && (bestiary.bounties.length > 0
          || bestiary.archmonsters.length > 0
          || bestiary.achievements.some((achievement) => achievement.monsters.length > 0));
    })).toBe(true);
  });
});
