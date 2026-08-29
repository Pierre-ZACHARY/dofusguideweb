import { describe, expect, it } from "vitest";
import { emptyStoredProgressProfile, type FollowedProfile } from "../../src/accounts/types.js";
import { chapterPercentForProfile, currentStepForProfile, followersInChapter } from "../../src/web/accounts/followedProgress.js";

const steps = [
  { stepNumber: 1, chapterId: 10, title: "Un", levelMin: 1, levelMax: 20 },
  { stepNumber: 2, chapterId: 10, title: "Deux", levelMin: 1, levelMax: 20 },
  { stepNumber: 3, chapterId: 20, title: "Trois", levelMin: 20, levelMax: 50 },
];
const chapter = { id: 10, chapterNumber: 1, name: "Départ", levelMin: 1, levelMax: 20, startStep: 1, endStep: 2 };

function friend(): FollowedProfile {
  return {
    id: "profile",
    ownerUserId: "owner",
    ownerDisplayName: "Ami",
    ownerPictureUrl: null,
    name: "Iopette",
    breedId: 9,
    gender: "FEMALE",
  avatarUrl: null,
  serverId: null,
  serverName: null,
  dofusVerifiedAt: null,
    progress: emptyStoredProgressProfile(),
    revision: 1,
    shareToken: "token",
    isOnline: false,
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("followed profile positions", () => {
  it("locates the first unfinished step and its chapter percentage", () => {
    const profile = friend();
    profile.progress.steps["-1:1"] = "COMPLETED";
    expect(currentStepForProfile(profile.progress, -1, steps)).toBe(2);
    expect(followersInChapter([profile], -1, chapter, steps)).toEqual([profile]);
    expect(chapterPercentForProfile(profile, -1, chapter, steps)).toBe(50);
  });

  it("does not let a stale future in-progress state skip an unfinished step", () => {
    const profile = friend();
    profile.progress.steps["-1:1"] = "COMPLETED";
    profile.progress.steps["-1:3"] = "IN_PROGRESS";
    expect(currentStepForProfile(profile.progress, -1, steps)).toBe(2);
    expect(followersInChapter([profile], -1, chapter, steps)).toEqual([profile]);
  });

  it("ignores introductory steps that do not belong to a chapter", () => {
    const profile = friend();
    profile.progress.steps["-1:1"] = "COMPLETED";
    const stepsWithIntroduction = [
      { stepNumber: 0, chapterId: null, title: "Introduction", levelMin: null, levelMax: null },
      ...steps,
    ];

    expect(currentStepForProfile(profile.progress, -1, stepsWithIntroduction)).toBe(2);
    expect(followersInChapter([profile], -1, chapter, stepsWithIntroduction)).toEqual([profile]);
  });

  it("only displays a followed profile in the chapter containing its current step", () => {
    const profile = friend();
    profile.progress.steps["-1:1"] = "COMPLETED";
    profile.progress.steps["-1:2"] = "COMPLETED";
    const nextChapter = { id: 20, chapterNumber: 2, name: "Suite", levelMin: 20, levelMax: 50, startStep: 3, endStep: 3 };

    expect(followersInChapter([profile], -1, chapter, steps)).toEqual([]);
    expect(followersInChapter([profile], -1, nextChapter, steps)).toEqual([profile]);
  });
});
