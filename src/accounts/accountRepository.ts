import { PostgresAccountRepository } from "./postgresAccountRepository.js";
import { SqliteAccountRepository } from "./sqliteAccountRepository.js";
import type {
  AccountSession,
  FollowedProfile,
  GoogleIdentity,
  PlayerProfile,
  ProfileGender,
  MetaMobProfileLink,
  StoredMetaMobCredential,
  StoredProgressProfile,
  VerifiedDofusIdentity,
} from "./types.js";

type Awaitable<T> = T | Promise<T>;

export interface AccountRepository {
  close(): Awaitable<void>;
  upsertGoogleUser(identity: GoogleIdentity, initialProgress: StoredProgressProfile, avatarUrl: string | null): Awaitable<string>;
  createSession(userId: string): Awaitable<string>;
  deleteSession(token: string): Awaitable<void>;
  userIdForSession(token: string): Awaitable<string | null>;
  touchSessionPresence(token: string, userId: string, profileId: string): Awaitable<void>;
  getAccount(userId: string): Awaitable<AccountSession | null>;
  createProfile(
    userId: string,
    name: string,
    breedId: number,
    gender: ProfileGender,
    avatarUrl: string | null,
    progress?: StoredProgressProfile,
    dofusIdentity?: VerifiedDofusIdentity | null,
  ): Awaitable<PlayerProfile>;
  setActiveProfile(userId: string, profileId: string): Awaitable<void>;
  updateProfile(userId: string, profileId: string, name: string, breedId: number, gender: ProfileGender, avatarUrl: string | null, dofusIdentity: VerifiedDofusIdentity | null): Awaitable<void>;
  saveProgress(userId: string, profileId: string, progress: StoredProgressProfile): Awaitable<void>;
  enableSharing(userId: string, profileId: string): Awaitable<string>;
  followSharedProfile(userId: string, shareToken: string): Awaitable<void>;
  unfollowProfile(userId: string, profileId: string): Awaitable<void>;
  getSharedProfile(shareToken: string): Awaitable<FollowedProfile | null>;
  getMetaMobCredential(userId: string): Awaitable<StoredMetaMobCredential | null>;
  saveMetaMobCredential(userId: string, username: string, encryptedApiKey: string, encryptionIv: string): Awaitable<void>;
  getMetaMobProfileLink(userId: string, profileId: string): Awaitable<MetaMobProfileLink | null>;
  saveMetaMobProfileLink(userId: string, profileId: string, questSlug: string, characterName: string): Awaitable<void>;
  deleteMetaMobProfileLink(userId: string, profileId: string): Awaitable<void>;
}

let sharedPostgresRepository: Promise<PostgresAccountRepository> | null = null;

function postgresUserDatabaseUrl(): string | null {
  const configured = process.env.DOFUSGUIDE_USER_DATABASE_URL?.trim()
    ?? process.env.DOFUSGUIDE_USER_DB_URL?.trim()
    ?? process.env.DATABASE_URL?.trim()
    ?? "";
  return configured === "" ? null : configured;
}

export async function createAccountRepository(): Promise<AccountRepository> {
  const databaseUrl = postgresUserDatabaseUrl();
  if (databaseUrl === null) return new SqliteAccountRepository();
  if (sharedPostgresRepository === null) {
    sharedPostgresRepository = PostgresAccountRepository.create(databaseUrl).catch((error: unknown) => {
      sharedPostgresRepository = null;
      throw error;
    });
  }
  return sharedPostgresRepository;
}
