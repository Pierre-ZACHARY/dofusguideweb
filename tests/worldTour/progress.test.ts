import { describe, expect, it } from "vitest";
import { emptyStoredProgressProfile } from "../../src/accounts/types.js";
import { summarizeWorldTourProgress } from "../../src/worldTour/progress.js";
import type { WorldTourTrack } from "../../src/worldTour/types.js";

const dungeon = (order: number, guideStep: number) => ({
  order,
  achievementId: 559,
  questId: order,
  questName: "Quête " + order,
  questStepId: order,
  dungeonId: order,
  dungeonName: "Donjon " + order,
  bossId: order,
  bossName: "Boss " + order,
  bossLevel: 20,
  bossLifePoints: 280,
  bossImageUrl: null,
  guideStep,
  dofusPourLesNoobsUrl: null,
});

describe("world tour progress", () => {
  it("counts completed guide steps and selects the first remaining boss", () => {
    const profile = emptyStoredProgressProfile();
    profile.steps["-1:21"] = "COMPLETED";
    const track: WorldTourTrack = {
      id: "metag-robill",
      name: "Metag Robill",
      achievementIds: [559],
      dungeons: [dungeon(1, 21), dungeon(2, 23), dungeon(3, 29)],
    };

    expect(summarizeWorldTourProgress(profile, -1, track)).toMatchObject({
      completed: 1,
      total: 3,
      percent: 33,
      next: { bossName: "Boss 2", guideStep: 23 },
    });
  });
});
