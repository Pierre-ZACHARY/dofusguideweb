import type { ChapterDto, StepSummaryDto } from "../data/models.js";
import { getStepProgress, parseObjectiveKey, type ProgressProfile } from "./progressStore.js";

export interface ChapterProgressSummary {
  stepNumbers: number[];
  completed: number;
  total: number;
  percent: number;
  isCompleted: boolean;
  currentStep: number;
}

export function summarizeChapterProgress(
  profile: Pick<ProgressProfile, "steps" | "objectives">,
  guideId: number,
  chapter: ChapterDto,
  steps: StepSummaryDto[],
): ChapterProgressSummary {
  const chapterSteps = steps.filter((step) => step.chapterId === chapter.id);
  const completed = chapterSteps.filter((step) => getStepProgress(profile, guideId, step.stepNumber) === "COMPLETED").length;
  const total = chapterSteps.length;
  const stepIndex = new Map(chapterSteps.map((step, index) => [step.stepNumber, index]));
  const lastCompletedObjective = Object.keys(profile.objectives)
    .map(parseObjectiveKey)
    .filter((objective): objective is NonNullable<typeof objective> => objective?.guideId === guideId && stepIndex.has(objective.stepNumber))
    .sort((left, right) => (stepIndex.get(left.stepNumber) ?? -1) - (stepIndex.get(right.stepNumber) ?? -1) || left.sortOrder - right.sortOrder)
    .at(-1);
  let lastCompletedStepIndex = -1;
  for (const [index, step] of chapterSteps.entries()) {
    if (getStepProgress(profile, guideId, step.stepNumber) === "COMPLETED") lastCompletedStepIndex = index;
  }
  let currentStep = chapterSteps[0]?.stepNumber ?? chapter.startStep;
  if (lastCompletedObjective !== undefined) {
    const index = stepIndex.get(lastCompletedObjective.stepNumber) ?? 0;
    const quests = chapterSteps[index]?.quests ?? [];
    const lastQuestSortOrder = Math.max(...quests.map((quest) => quest.sortOrder), Number.NEGATIVE_INFINITY);
    currentStep = lastCompletedObjective.sortOrder >= lastQuestSortOrder
      ? chapterSteps[index + 1]?.stepNumber ?? lastCompletedObjective.stepNumber
      : lastCompletedObjective.stepNumber;
  } else if (lastCompletedStepIndex >= 0) {
    currentStep = chapterSteps[lastCompletedStepIndex + 1]?.stepNumber ?? chapterSteps[0]?.stepNumber ?? chapter.startStep;
  }
  return {
    stepNumbers: chapterSteps.map((step) => step.stepNumber),
    completed,
    total,
    percent: total === 0 ? 0 : Math.round(completed / total * 100),
    isCompleted: total > 0 && completed === total,
    currentStep: total > 0 && completed === total ? chapterSteps[0]?.stepNumber ?? chapter.startStep : currentStep,
  };
}
