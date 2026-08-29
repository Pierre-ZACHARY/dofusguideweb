import { describe, expect, it } from "vitest";
import {
  helperMatchesObjective,
  parsePresenceLocation,
  parseQuestHelpObjective,
  sameHelpObjective,
} from "../../src/presence/types.js";

const objective = { guideId: -1, stepNumber: 115, questKey: "quest:42", relation: "ACTIVE" as const, sortOrder: 3 };

describe("site presence types", () => {
  it("accepts the negative identifier used by the main guide", () => {
    expect(parsePresenceLocation({ guideId: -1, stepNumber: 115 })).toEqual({ guideId: -1, stepNumber: 115 });
    expect(parseQuestHelpObjective(objective)).toEqual(objective);
  });

  it("rejects incomplete or unsafe quest locations", () => {
    expect(parsePresenceLocation({ guideId: 0, stepNumber: 1 })).toBeNull();
    expect(parseQuestHelpObjective({ ...objective, questKey: "" })).toBeNull();
    expect(parseQuestHelpObjective({ ...objective, relation: "INVALID" })).toBeNull();
  });

  it("matches helpers only to the exact quest occurrence", () => {
    expect(sameHelpObjective(objective, objective)).toBe(true);
    expect(sameHelpObjective({ ...objective, relation: "START" }, objective)).toBe(false);
    expect(helperMatchesObjective({
      ...objective,
      profileId: "profile",
      shareToken: "share",
      name: "Yukiix",
      avatarUrl: null,
      serverId: 353,
      serverName: "Dakal",
    }, objective)).toBe(true);
  });
});
