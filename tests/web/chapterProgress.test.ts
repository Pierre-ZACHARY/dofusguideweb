import { describe, expect, it } from "vitest";
import type { ChapterDto, StepSummaryDto } from "../../src/web/data/models.js";
import { summarizeChapterProgress } from "../../src/web/progress/chapterProgress.js";
import type { ProgressProfile } from "../../src/web/progress/progressStore.js";

const chapter: ChapterDto = { id: 2, chapterNumber: 2, name: "Grandir à Astrub", levelMin: 20, levelMax: 50, startStep: 9, endStep: 30 };
const steps: StepSummaryDto[] = [
  { stepNumber: 9, chapterId: 2, title: "A", levelMin: 20, levelMax: 50 },
  { stepNumber: 10, chapterId: 2, title: "B", levelMin: 20, levelMax: 50 },
  { stepNumber: 11, chapterId: 2, title: "C", levelMin: 20, levelMax: 50 },
];
const profile: ProgressProfile = {
  version: 2,
  steps: { "-1:9": "COMPLETED", "-1:10": "COMPLETED" },
  quests: {},
  objectives: {},
  dungeonSuccesses: {},
  tutorialActions: {},
};

describe("chapter progress", () => {
  it("envoie Continuer vers la première étape non terminée", () => {
    expect(summarizeChapterProgress(profile, -1, chapter, steps)).toMatchObject({
      completed: 2,
      total: 3,
      percent: 67,
      isCompleted: false,
      currentStep: 11,
    });
  });

  it("revient au début uniquement pour revoir un chapitre entièrement validé", () => {
    const completed = { ...profile, steps: { "-1:9": "COMPLETED", "-1:10": "COMPLETED", "-1:11": "COMPLETED" } } satisfies ProgressProfile;
    expect(summarizeChapterProgress(completed, -1, chapter, steps)).toMatchObject({ isCompleted: true, currentStep: 9 });
  });
});
