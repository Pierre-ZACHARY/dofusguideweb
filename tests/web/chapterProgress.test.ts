import { describe, expect, it } from "vitest";
import type { ChapterDto, StepSummaryDto } from "../../src/web/data/models.js";
import { summarizeChapterProgress } from "../../src/web/progress/chapterProgress.js";
import type { ProgressProfile } from "../../src/web/progress/progressStore.js";

const chapter: ChapterDto = { id: 2, chapterNumber: 2, name: "Grandir à Astrub", levelMin: 20, levelMax: 50, startStep: 9, endStep: 30 };
const steps: StepSummaryDto[] = [
  { stepNumber: 9, chapterId: 2, title: "A", levelMin: 20, levelMax: 50, quests: [
    { questKey: "quest:a", relation: "ACTIVE", sortOrder: 1 },
    { questKey: "quest:b", relation: "ACTIVE", sortOrder: 2 },
  ] },
  { stepNumber: 10, chapterId: 2, title: "Conseils", levelMin: 20, levelMax: 50, quests: [] },
  { stepNumber: 11, chapterId: 2, title: "C", levelMin: 20, levelMax: 50, quests: [{ questKey: "quest:c", relation: "ACTIVE", sortOrder: 1 }] },
];
const profile: ProgressProfile = {
  version: 2,
  steps: { "-1:9": "COMPLETED", "-1:10": "COMPLETED" },
  quests: {},
  objectives: { "[-1,9,\"quest:b\",\"ACTIVE\",2]": true },
  dungeonSuccesses: {},
  tutorialActions: {},
};

describe("chapter progress", () => {
  it("reprend à l’étape suivant la dernière quête lorsqu’elle termine son étape", () => {
    expect(summarizeChapterProgress(profile, -1, chapter, steps)).toMatchObject({
      completed: 2,
      total: 3,
      percent: 67,
      isCompleted: false,
      currentStep: 10,
    });
  });

  it("reste sur l’étape de la dernière quête si une quête suivante y est encore présente", () => {
    const partial = { ...profile, steps: { "-1:9": "IN_PROGRESS" }, objectives: { "[-1,9,\"quest:a\",\"ACTIVE\",1]": true } } satisfies ProgressProfile;
    expect(summarizeChapterProgress(partial, -1, chapter, steps)).toMatchObject({ currentStep: 9 });
  });

  it("revient au début uniquement pour revoir un chapitre entièrement validé", () => {
    const completed = { ...profile, steps: { "-1:9": "COMPLETED", "-1:10": "COMPLETED", "-1:11": "COMPLETED" } } satisfies ProgressProfile;
    expect(summarizeChapterProgress(completed, -1, chapter, steps)).toMatchObject({ isCompleted: true, currentStep: 9 });
  });
});
