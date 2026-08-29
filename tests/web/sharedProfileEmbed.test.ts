import { describe, expect, it } from "vitest";
import type { FollowedProfile, ProfileAvatar } from "../../src/accounts/types.js";
import type { DofusCharacter } from "../../src/dofus/ladder.js";
import type { SharedProfileGuideIndexDto } from "../../src/web/data/models.js";
import {
  buildSharedProfileEmbedData,
  sharedProfileDescription,
  sharedProfileImageUrl,
  sharedProfileTitle,
} from "../../src/web/social/sharedProfileEmbed.js";
import { parseSharedProfileImageData } from "../../src/web/social/sharedProfileImageData.js";

const profile: FollowedProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  ownerDisplayName: "Pierre",
  ownerPictureUrl: null,
  name: "Yukiix",
  breedId: 1,
  gender: "MALE",
  avatarUrl: "/profile-avatars/1-male-full.png",
  serverId: 353,
  serverName: "Dakal",
  dofusVerifiedAt: "2026-08-29T10:00:00.000Z",
  progress: {
    version: 2,
    steps: { "-1:1": "COMPLETED", "-1:2": "COMPLETED", "-1:3": "IN_PROGRESS" },
    quests: {},
    objectives: {},
    dungeonSuccesses: {},
    tutorialActions: {},
    bestiaryObjectives: {},
  },
  revision: 12,
  shareToken: "a".repeat(32),
  isOnline: true,
  updatedAt: "2026-08-29T10:00:00.000Z",
};

const guides: SharedProfileGuideIndexDto[] = [{
  guideId: -1,
  guideName: "Guide Principal (Mono/Multi)",
  totalSteps: 4,
  steps: [
    { stepNumber: 0, chapterNumber: null, chapterName: null, boss: null },
    { stepNumber: 1, chapterNumber: 1, chapterName: "Incarnam", boss: null },
    { stepNumber: 2, chapterNumber: 1, chapterName: "Incarnam", boss: null },
    { stepNumber: 3, chapterNumber: 1, chapterName: "Incarnam", boss: null },
    {
      stepNumber: 4,
      chapterNumber: 1,
      chapterName: "Incarnam",
      boss: {
        dungeonName: "Crypte de Kardorim",
        bossName: "Kardorim",
        bossImageUrl: "/bestiary/monsters/100.png",
      },
    },
  ],
}];

const avatars: ProfileAvatar[] = [{
  key: "1-male",
  breedId: 1,
  breedName: "Féca",
  gender: "MALE",
  imageUrl: "/profile-avatars/1-male-full.png",
}];

const character: DofusCharacter = {
  name: "Yukiix",
  className: "Féca",
  serverId: 353,
  serverName: "Dakal",
  level: 143,
  achievementPoints: 4029,
};

describe("shared profile embeds", () => {
  it("summarizes the current step and next boss", () => {
    const embed = buildSharedProfileEmbedData(profile, guides, avatars, character);

    expect(embed.completedSteps).toBe(2);
    expect(embed.currentStep).toBe(3);
    expect(embed.chapterName).toBe("Incarnam");
    expect(embed.nextBoss?.bossName).toBe("Kardorim");
    expect(sharedProfileTitle(embed)).toContain("Yukiix");
    expect(sharedProfileDescription(embed)).toContain("Féca niveau 143 sur Dakal");
    expect(sharedProfileDescription(embed)).toContain("prochain boss : Kardorim");
  });

  it("creates a validated, cache-busted image request", () => {
    const embed = buildSharedProfileEmbedData(profile, guides, avatars, character);
    const imageUrl = sharedProfileImageUrl(embed);
    const url = new URL(imageUrl);
    const parsed = parseSharedProfileImageData(new Request(url));

    expect(url.pathname).toBe("/api/social/shared-profile.png");
    expect(url.searchParams.get("revision")).toBe("12");
    expect(parsed).toMatchObject({
      name: "Yukiix",
      server: "Dakal",
      className: "Féca",
      level: 143,
      success: 4029,
      step: 3,
      total: 4,
      completed: 2,
      boss: "Kardorim",
    });
  });
});
