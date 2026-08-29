import { describe, expect, it } from "vitest";
import { MAX_QUEST_GUIDE_ACTIONS, questGuideContentSchema, questGuideJsonSchema } from "../../src/questGuides/types.js";

describe("quest guide action limits", () => {
  it("accepts detailed long quests and keeps the generator schema aligned", () => {
    const actions = Array.from({ length: 42 }, (_, index) => ({
      instruction: `Action ${index + 1}`,
      position: null,
      zoneHint: null,
      warning: null,
      combat: "NONE" as const,
    }));

    expect(() => questGuideContentSchema.parse({
      overview: "Une quête particulièrement longue.",
      recommendedLevel: 200,
      prerequisites: [],
      rewards: [],
      preparation: [],
      actions,
      notes: [],
      npcs: [],
      items: [],
    })).not.toThrow();
    expect(questGuideJsonSchema.properties.actions.maxItems).toBe(MAX_QUEST_GUIDE_ACTIONS);
  });
});
