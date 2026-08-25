import type { FollowedProfile, StoredProgressProfile } from "../../accounts/types.js";
import type { ChapterDto, StepSummaryDto } from "../data/models.js";
import { getStepProgress } from "../progress/progressStore.js";
import { summarizeChapterProgress } from "../progress/chapterProgress.js";

export function currentStepForProfile(profile: StoredProgressProfile, guideId: number, steps: StepSummaryDto[]): number | null {
  // The imported guide contains introductory steps before chapter 1. They are
  // useful pages, but must not pin every followed profile outside the chapter
  // overview when they have no explicit completion state.
  const ordered = steps
    .filter((step) => step.chapterId !== null)
    .sort((left, right) => left.stepNumber - right.stepNumber);
  const next = ordered.find((step) => getStepProgress(profile, guideId, step.stepNumber) !== "COMPLETED");
  return next?.stepNumber ?? ordered.at(-1)?.stepNumber ?? null;
}

export function followersInChapter(
  followers: FollowedProfile[],
  guideId: number,
  chapter: ChapterDto,
  steps: StepSummaryDto[],
): FollowedProfile[] {
  return followers.filter((profile) => {
    const step = currentStepForProfile(profile.progress, guideId, steps);
    return step !== null && step >= chapter.startStep && step <= chapter.endStep;
  });
}

export function chapterPercentForProfile(
  profile: FollowedProfile,
  guideId: number,
  chapter: ChapterDto,
  steps: StepSummaryDto[],
): number {
  return summarizeChapterProgress(profile.progress, guideId, chapter, steps).percent;
}
