import type { FollowedProfile, ProfileAvatar } from "../../accounts/types.js";
import type { DofusCharacter } from "../../dofus/ladder.js";
import type { SharedProfileBossDto, SharedProfileGuideIndexDto } from "../data/models.js";
import { getStepProgress } from "../progress/progressStore.js";

export const MAIN_GUIDE_ID = -1;
export const SITE_ORIGIN = "https://dofusguideweb.com";
export const SHARED_PROFILE_IMAGE_PATH = "/api/social/shared-profile.png";

export interface SharedProfileEmbedData {
  profile: FollowedProfile;
  character: DofusCharacter | null;
  breedName: string;
  guideName: string;
  completedSteps: number;
  currentStep: number;
  totalSteps: number;
  chapterNumber: number | null;
  chapterName: string | null;
  nextBoss: SharedProfileBossDto | null;
}

export function buildSharedProfileEmbedData(
  profile: FollowedProfile,
  guides: readonly SharedProfileGuideIndexDto[],
  avatars: readonly ProfileAvatar[],
  character: DofusCharacter | null,
): SharedProfileEmbedData {
  const guide = guides.find((candidate) => candidate.guideId === MAIN_GUIDE_ID) ?? guides[0];
  if (guide === undefined || guide.steps.length === 0) throw new Error("Index du guide principal indisponible");
  const allSteps = [...guide.steps].sort((left, right) => left.stepNumber - right.stepNumber);
  const chapterSteps = allSteps.filter((step) => step.chapterNumber !== null);
  // Introductory pages are useful guide context but have no chapter and no
  // explicit completion state for older profiles. They must not pin the social
  // preview to step 1 after the player has already started the actual guide.
  const orderedSteps = chapterSteps.length > 0 ? chapterSteps : allSteps;
  const current = orderedSteps.find((step) => getStepProgress(profile.progress, guide.guideId, step.stepNumber) !== "COMPLETED")
    ?? orderedSteps.at(-1)!;
  const currentIndex = orderedSteps.findIndex((step) => step.stepNumber === current.stepNumber);
  const nextBoss = orderedSteps.slice(Math.max(currentIndex, 0)).find((step) => step.boss !== null)?.boss ?? null;
  const completedSteps = allSteps.filter((step) =>
    getStepProgress(profile.progress, guide.guideId, step.stepNumber) === "COMPLETED").length;
  const breedName = avatars.find((avatar) => avatar.breedId === profile.breedId && avatar.gender === profile.gender)?.breedName
    ?? "Aventurier";

  return {
    profile,
    character,
    breedName,
    guideName: guide.guideName,
    completedSteps,
    currentStep: current.stepNumber,
    totalSteps: guide.totalSteps,
    chapterNumber: current.chapterNumber,
    chapterName: current.chapterName,
    nextBoss,
  };
}

export function sharedProfileTitle(data: SharedProfileEmbedData): string {
  return data.profile.name + " — progression DOFUS | DofusGuide Web";
}

export function sharedProfileDescription(data: SharedProfileEmbedData): string {
  const identity = data.character === null
    ? [data.breedName, data.profile.serverName].filter(Boolean).join(" sur ")
    : `${data.character.className} niveau ${data.character.level} sur ${data.character.serverName} · ${data.character.achievementPoints.toLocaleString("fr-FR")} points de succès`;
  const progress = `étape ${data.currentStep}/${data.totalSteps}`;
  const boss = data.nextBoss === null ? "guide terminé" : `prochain boss : ${data.nextBoss.bossName}`;
  return `${identity} · ${progress} · ${boss}. Suivez sa progression sur DofusGuide Web.`;
}

function absoluteAssetUrl(value: string | null): string {
  return new URL(value ?? "/favicon.png", SITE_ORIGIN).toString();
}

export function sharedProfileImageUrl(data: SharedProfileEmbedData): string {
  const url = new URL(SHARED_PROFILE_IMAGE_PATH, SITE_ORIGIN);
  url.searchParams.set("name", data.profile.name);
  url.searchParams.set("server", data.character?.serverName ?? data.profile.serverName ?? "Serveur non renseigné");
  url.searchParams.set("class", data.character?.className ?? data.breedName);
  if (data.character !== null) {
    url.searchParams.set("level", String(data.character.level));
    url.searchParams.set("success", String(data.character.achievementPoints));
  }
  url.searchParams.set("step", String(data.currentStep));
  url.searchParams.set("total", String(data.totalSteps));
  url.searchParams.set("completed", String(data.completedSteps));
  url.searchParams.set("chapter", data.chapterNumber === null
    ? data.chapterName ?? "Guide principal"
    : `Chapitre ${data.chapterNumber} · ${data.chapterName ?? "Guide principal"}`);
  if (data.nextBoss !== null) {
    url.searchParams.set("boss", data.nextBoss.bossName);
    url.searchParams.set("dungeon", data.nextBoss.dungeonName);
    if (data.nextBoss.bossImageUrl !== null) url.searchParams.set("bossImage", absoluteAssetUrl(data.nextBoss.bossImageUrl));
  }
  url.searchParams.set("avatar", absoluteAssetUrl(data.profile.avatarUrl));
  url.searchParams.set("revision", String(data.profile.revision));
  return url.toString();
}
