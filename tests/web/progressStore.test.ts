import { describe, expect, it } from "vitest";
import {
  getQuestProgress,
  getStepProgress,
  bestiaryObjectiveKey,
  isBestiaryObjectiveCompleted,
  isObjectiveCompleted,
  objectiveKey,
  questStatusForCompletedRelations,
  type ObjectiveIdentity,
  type ProgressProfile,
} from "../../src/web/progress/progressStore.js";

describe("progress selectors", () => {
  const objective: ObjectiveIdentity = {
    guideId: -1,
    stepNumber: 6,
    questKey: "quest:898",
    relation: "ACTIVE",
    sortOrder: 0,
  };
  const profile: ProgressProfile = {
    version: 2,
    steps: { "-1:28": "COMPLETED" },
    quests: { "quest:132": "ACTIVE" },
    objectives: { [objectiveKey(objective)]: true },
    dungeonSuccesses: {},
    tutorialActions: {},
  };

  it("sépare les états utilisateur des relations du guide", () => {
    expect(getStepProgress(profile, -1, 28)).toBe("COMPLETED");
    expect(getStepProgress(profile, -1, 29)).toBe("NOT_STARTED");
    expect(getQuestProgress(profile, "quest:132")).toBe("ACTIVE");
  });

  it("identifie une occurrence cochée sans confondre les étapes", () => {
    expect(isObjectiveCompleted(profile, objective)).toBe(true);
    expect(isObjectiveCompleted(profile, { ...objective, stepNumber: 7 })).toBe(false);
  });

  it("considère les objectifs d’une étape validée en bloc comme cochés", () => {
    expect(isObjectiveCompleted({ ...profile, steps: { "-1:6": "COMPLETED" }, objectives: {} }, objective)).toBe(true);
  });

  it("fait avancer la quête selon la relation cochée", () => {
    expect(questStatusForCompletedRelations(["START"])).toBe("STARTED");
    expect(questStatusForCompletedRelations(["ACTIVE"])).toBe("COMPLETED");
    expect(questStatusForCompletedRelations(["FINISH"])).toBe("COMPLETED");
    expect(questStatusForCompletedRelations([])).toBe("NOT_STARTED");
  });

  it("partage un objectif bestiaire par identifiant DofusDB, indépendamment de l'étape", () => {
    const archmonster = { kind: "ARCHMONSTER" as const, monsterId: 2345 };
    const bestiaryProfile: ProgressProfile = { ...profile, bestiaryObjectives: { [bestiaryObjectiveKey(archmonster)]: true } };
    expect(isBestiaryObjectiveCompleted(bestiaryProfile, archmonster)).toBe(true);
    expect(isBestiaryObjectiveCompleted(bestiaryProfile, { kind: "ARCHMONSTER", monsterId: 2343 })).toBe(false);
  });
});
