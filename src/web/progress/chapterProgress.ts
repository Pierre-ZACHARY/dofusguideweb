import type { ChapterDto, StepSummaryDto } from "../data/models.js";
import { getStepProgress, type ProgressProfile } from "./progressStore.js";

export interface ChapterProgressSummary {
  stepNumbers: number[];
  completed: number;
  total: number;
  percent: number;
  isCompleted: boolean;
  currentStep: number;
}

export function summarizeChapterProgress(
  profile: Pick<ProgressProfile, "steps">,
  guideId: number,
  chapter: ChapterDto,
  steps: StepSummaryDto[],
): ChapterProgressSummary {
  const chapterSteps = steps.filter((step) => step.chapterId === chapter.id);
  const completed = chapterSteps.filter((step) => getStepProgress(profile, guideId, step.stepNumber) === "COMPLETED").length;
  const total = chapterSteps.length;
  return {
    stepNumbers: chapterSteps.map((step) => step.stepNumber),
    completed,
    total,
    percent: total === 0 ? 0 : Math.round(completed / total * 100),
    isCompleted: total > 0 && completed === total,
    currentStep: chapterSteps.find((step) => getStepProgress(profile, guideId, step.stepNumber) !== "COMPLETED")?.stepNumber
      ?? chapterSteps[0]?.stepNumber
      ?? chapter.startStep,
  };
}
