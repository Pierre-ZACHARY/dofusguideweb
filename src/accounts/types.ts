import { z } from "zod";

export const stepProgressStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"]);
export const questProgressStatusSchema = z.enum(["NOT_STARTED", "STARTED", "ACTIVE", "COMPLETED", "SKIPPED"]);

const completedFlagsSchema = z.record(z.string(), z.literal(true));

export const storedProgressProfileSchema = z.object({
  version: z.literal(2),
  steps: z.record(z.string(), stepProgressStatusSchema),
  quests: z.record(z.string(), questProgressStatusSchema),
  objectives: completedFlagsSchema,
  dungeonSuccesses: completedFlagsSchema,
  tutorialActions: completedFlagsSchema,
  bestiaryObjectives: completedFlagsSchema.optional(),
});

export type StoredProgressProfile = z.infer<typeof storedProgressProfileSchema>;
export type ProfileGender = "MALE" | "FEMALE";

export interface VerifiedDofusIdentity {
  serverId: number;
  serverName: string;
  verifiedAt: string;
}

export function emptyStoredProgressProfile(): StoredProgressProfile {
  return { version: 2, steps: {}, quests: {}, objectives: {}, dungeonSuccesses: {}, tutorialActions: {}, bestiaryObjectives: {} };
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
}

export interface PlayerProfile {
  id: string;
  ownerUserId: string;
  name: string;
  breedId: number;
  gender: ProfileGender;
  avatarUrl: string | null;
  serverId: number | null;
  serverName: string | null;
  dofusVerifiedAt: string | null;
  progress: StoredProgressProfile;
  revision: number;
  shareToken: string | null;
  isOnline: boolean;
  updatedAt: string;
}

export interface FollowedProfile extends PlayerProfile {
  ownerDisplayName: string;
  ownerPictureUrl: string | null;
}

export interface AccountSession {
  user: {
    id: string;
    email: string;
    displayName: string;
    pictureUrl: string | null;
  };
  profiles: PlayerProfile[];
  activeProfileId: string;
  following: FollowedProfile[];
}

export interface ProfileAvatar {
  key: string;
  breedId: number;
  breedName: string;
  gender: ProfileGender;
  imageUrl: string | null;
}

export interface StoredMetaMobCredential {
  userId: string;
  username: string;
  encryptedApiKey: string;
  encryptionIv: string;
  updatedAt: string;
}

export interface MetaMobProfileLink {
  profileId: string;
  ownerUserId: string;
  questSlug: string;
  characterName: string;
  updatedAt: string;
}
