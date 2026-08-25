import type { StoredProgressProfile } from "../accounts/types.js";
import { getStepProgress } from "../web/progress/progressStore.js";
import type { WorldTourDungeon, WorldTourTrack } from "./types.js";

export interface WorldTourProgressSummary {
  completed: number;
  total: number;
  percent: number;
  next: WorldTourDungeon | null;
}

export function summarizeWorldTourProgress(
  profile: Pick<StoredProgressProfile, "steps">,
  guideId: number,
  track: WorldTourTrack,
): WorldTourProgressSummary {
  const completed = track.dungeons.filter((dungeon) =>
    dungeon.guideStep !== null && getStepProgress(profile, guideId, dungeon.guideStep) === "COMPLETED"
  ).length;
  return {
    completed,
    total: track.dungeons.length,
    percent: track.dungeons.length === 0 ? 0 : Math.round(completed / track.dungeons.length * 100),
    next: track.dungeons.find((dungeon) =>
      dungeon.guideStep === null || getStepProgress(profile, guideId, dungeon.guideStep) !== "COMPLETED"
    ) ?? null,
  };
}
