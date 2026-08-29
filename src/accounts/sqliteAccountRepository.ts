import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { applyMigrations } from "../db/migrations.js";
import { accountSessions, accountUsers, accountSchema, metamobCredentials, metamobProfileLinks, playerProfiles, profileFollows } from "./schema.js";
import {
  emptyStoredProgressProfile,
  storedProgressProfileSchema,
  type AccountSession,
  type FollowedProfile,
  type GoogleIdentity,
  type MetaMobProfileLink,
  type PlayerProfile,
  type ProfileGender,
  type StoredProgressProfile,
  type StoredMetaMobCredential,
  type VerifiedDofusIdentity,
} from "./types.js";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PRESENCE_WINDOW_MS = 12_000;

function now(): string {
  return new Date().toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseProgress(value: string): StoredProgressProfile {
  const parsed = storedProgressProfileSchema.safeParse(JSON.parse(value) as unknown);
  return parsed.success ? parsed.data : emptyStoredProgressProfile();
}

type ProfileRow = typeof playerProfiles.$inferSelect;

function profileFromRow(row: ProfileRow, isOnline = false): PlayerProfile {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    breedId: row.breedId,
    gender: row.gender,
    avatarUrl: row.avatarUrl,
    serverId: row.serverId,
    serverName: row.serverName,
    dofusVerifiedAt: row.dofusVerifiedAt,
    progress: parseProgress(row.progressJson),
    revision: row.revision,
    shareToken: row.shareToken,
    isOnline,
    updatedAt: row.updatedAt,
  };
}

export class SqliteAccountRepository {
  private readonly database: Database.Database;
  private readonly db;

  constructor(
    databasePath = process.env.DOFUSGUIDE_USER_DB ?? "data/user-data.sqlite",
    migrationsDirectory = "drizzle-user",
  ) {
    const resolvedPath = path.resolve(databasePath);
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.database = new Database(resolvedPath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    applyMigrations(this.database, path.resolve(migrationsDirectory));
    this.db = drizzle(this.database, { schema: accountSchema });
  }

  close(): void {
    this.database.close();
  }

  upsertGoogleUser(identity: GoogleIdentity, initialProgress: StoredProgressProfile, avatarUrl: string | null): string {
    const timestamp = now();
    const existing = this.db.select().from(accountUsers).where(eq(accountUsers.googleSubject, identity.subject)).get();
    if (existing !== undefined) {
      this.db.update(accountUsers).set({
        email: identity.email,
        displayName: identity.displayName,
        pictureUrl: identity.pictureUrl,
        updatedAt: timestamp,
      }).where(eq(accountUsers.id, existing.id)).run();
      this.ensureDefaultProfile(existing.id, initialProgress, avatarUrl);
      return existing.id;
    }
    const userId = randomUUID();
    this.db.insert(accountUsers).values({
      id: userId,
      googleSubject: identity.subject,
      email: identity.email,
      displayName: identity.displayName,
      pictureUrl: identity.pictureUrl,
      activeProfileId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    this.ensureDefaultProfile(userId, initialProgress, avatarUrl);
    return userId;
  }

  private ensureDefaultProfile(userId: string, initialProgress: StoredProgressProfile, avatarUrl: string | null): void {
    const profiles = this.db.select({ id: playerProfiles.id }).from(playerProfiles).where(eq(playerProfiles.ownerUserId, userId)).all();
    if (profiles.length > 0) {
      const user = this.db.select().from(accountUsers).where(eq(accountUsers.id, userId)).get();
      if (!user?.activeProfileId) this.setActiveProfile(userId, profiles[0]!.id);
      return;
    }
    const profile = this.createProfile(userId, "Mon personnage", 9, "MALE", avatarUrl, initialProgress);
    this.setActiveProfile(userId, profile.id);
  }

  createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    const timestamp = now();
    this.db.insert(accountSessions).values({
      tokenHash: hashToken(token),
      userId,
      activeProfileId: null,
      lastSeenAt: null,
      createdAt: timestamp,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    }).run();
    return token;
  }

  deleteSession(token: string): void {
    this.db.delete(accountSessions).where(eq(accountSessions.tokenHash, hashToken(token))).run();
  }

  userIdForSession(token: string): string | null {
    const session = this.db.select().from(accountSessions).where(and(
      eq(accountSessions.tokenHash, hashToken(token)),
      gt(accountSessions.expiresAt, now()),
    )).get();
    return session?.userId ?? null;
  }

  touchSessionPresence(token: string, userId: string, profileId: string): void {
    const owned = this.db.select({ id: playerProfiles.id }).from(playerProfiles).where(and(
      eq(playerProfiles.id, profileId),
      eq(playerProfiles.ownerUserId, userId),
    )).get();
    if (owned === undefined) throw new Error("Profil introuvable");
    const changed = this.db.update(accountSessions).set({ activeProfileId: profileId, lastSeenAt: now() }).where(and(
      eq(accountSessions.tokenHash, hashToken(token)),
      eq(accountSessions.userId, userId),
      gt(accountSessions.expiresAt, now()),
    )).run();
    if (changed.changes === 0) throw new Error("Session expirée");
  }

  private onlineProfileIds(): Set<string> {
    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
    const rows = this.db.select({ profileId: accountSessions.activeProfileId }).from(accountSessions).where(and(
      gt(accountSessions.lastSeenAt, cutoff),
      gt(accountSessions.expiresAt, now()),
    )).all();
    return new Set(rows.flatMap((row) => row.profileId ? [row.profileId] : []));
  }

  getAccount(userId: string): AccountSession | null {
    const user = this.db.select().from(accountUsers).where(eq(accountUsers.id, userId)).get();
    if (user === undefined) return null;
    const onlineProfiles = this.onlineProfileIds();
    const profiles = this.db.select().from(playerProfiles).where(eq(playerProfiles.ownerUserId, userId)).all()
      .map((profile) => profileFromRow(profile, onlineProfiles.has(profile.id)));
    if (profiles.length === 0) return null;
    const activeProfileId = profiles.some((profile) => profile.id === user.activeProfileId)
      ? user.activeProfileId!
      : profiles[0]!.id;
    if (activeProfileId !== user.activeProfileId) this.setActiveProfile(userId, activeProfileId);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
      },
      profiles,
      activeProfileId,
      following: this.listFollowing(userId),
    };
  }

  createProfile(
    userId: string,
    name: string,
    breedId: number,
    gender: ProfileGender,
    avatarUrl: string | null,
    progress: StoredProgressProfile = emptyStoredProgressProfile(),
    dofusIdentity: VerifiedDofusIdentity | null = null,
  ): PlayerProfile {
    const timestamp = now();
    const row: ProfileRow = {
      id: randomUUID(),
      ownerUserId: userId,
      name,
      breedId,
      gender,
      avatarUrl,
      serverId: dofusIdentity?.serverId ?? null,
      serverName: dofusIdentity?.serverName ?? null,
      dofusVerifiedAt: dofusIdentity?.verifiedAt ?? null,
      progressJson: JSON.stringify(progress),
      revision: 1,
      shareToken: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(playerProfiles).values(row).run();
    return profileFromRow(row);
  }

  setActiveProfile(userId: string, profileId: string): void {
    const owned = this.db.select({ id: playerProfiles.id }).from(playerProfiles).where(and(
      eq(playerProfiles.id, profileId),
      eq(playerProfiles.ownerUserId, userId),
    )).get();
    if (owned === undefined) throw new Error("Profil introuvable");
    this.db.update(accountUsers).set({ activeProfileId: profileId, updatedAt: now() }).where(eq(accountUsers.id, userId)).run();
  }

  updateProfile(userId: string, profileId: string, name: string, breedId: number, gender: ProfileGender, avatarUrl: string | null, dofusIdentity: VerifiedDofusIdentity | null): void {
    const changed = this.db.update(playerProfiles).set({
      name,
      breedId,
      gender,
      avatarUrl,
      serverId: dofusIdentity?.serverId ?? null,
      serverName: dofusIdentity?.serverName ?? null,
      dofusVerifiedAt: dofusIdentity?.verifiedAt ?? null,
      updatedAt: now(),
    }).where(and(eq(playerProfiles.id, profileId), eq(playerProfiles.ownerUserId, userId))).run();
    if (changed.changes === 0) throw new Error("Profil introuvable");
  }

  saveProgress(userId: string, profileId: string, progress: StoredProgressProfile): void {
    const changed = this.db.update(playerProfiles).set({
      progressJson: JSON.stringify(progress),
      revision: sql`${playerProfiles.revision} + 1`,
      updatedAt: now(),
    }).where(and(eq(playerProfiles.id, profileId), eq(playerProfiles.ownerUserId, userId))).run();
    if (changed.changes === 0) throw new Error("Profil introuvable");
  }

  enableSharing(userId: string, profileId: string): string {
    const profile = this.db.select().from(playerProfiles).where(and(
      eq(playerProfiles.id, profileId),
      eq(playerProfiles.ownerUserId, userId),
    )).get();
    if (profile === undefined) throw new Error("Profil introuvable");
    if (profile.shareToken) return profile.shareToken;
    const shareToken = randomBytes(24).toString("base64url");
    this.db.update(playerProfiles).set({ shareToken, updatedAt: now() }).where(eq(playerProfiles.id, profileId)).run();
    return shareToken;
  }

  followSharedProfile(userId: string, shareToken: string): void {
    const profile = this.db.select().from(playerProfiles).where(eq(playerProfiles.shareToken, shareToken)).get();
    if (profile === undefined) throw new Error("Partage introuvable");
    if (profile.ownerUserId === userId) return;
    this.db.insert(profileFollows).values({ followerUserId: userId, profileId: profile.id, createdAt: now() })
      .onConflictDoNothing().run();
  }

  unfollowProfile(userId: string, profileId: string): void {
    this.db.delete(profileFollows).where(and(
      eq(profileFollows.followerUserId, userId),
      eq(profileFollows.profileId, profileId),
    )).run();
  }

  getMetaMobCredential(userId: string): StoredMetaMobCredential | null {
    const row = this.db.select().from(metamobCredentials).where(eq(metamobCredentials.userId, userId)).get();
    return row ?? null;
  }

  saveMetaMobCredential(userId: string, username: string, encryptedApiKey: string, encryptionIv: string): void {
    this.db.insert(metamobCredentials).values({ userId, username, encryptedApiKey, encryptionIv, updatedAt: now() })
      .onConflictDoUpdate({ target: metamobCredentials.userId, set: { username, encryptedApiKey, encryptionIv, updatedAt: now() } }).run();
  }

  getMetaMobProfileLink(userId: string, profileId: string): MetaMobProfileLink | null {
    const row = this.db.select().from(metamobProfileLinks).where(and(
      eq(metamobProfileLinks.ownerUserId, userId),
      eq(metamobProfileLinks.profileId, profileId),
    )).get();
    return row ?? null;
  }

  saveMetaMobProfileLink(userId: string, profileId: string, questSlug: string, characterName: string): void {
    const owned = this.db.select({ id: playerProfiles.id }).from(playerProfiles).where(and(
      eq(playerProfiles.id, profileId), eq(playerProfiles.ownerUserId, userId),
    )).get();
    if (owned === undefined) throw new Error("Profil introuvable");
    this.db.insert(metamobProfileLinks).values({ profileId, ownerUserId: userId, questSlug, characterName, updatedAt: now() })
      .onConflictDoUpdate({ target: metamobProfileLinks.profileId, set: { questSlug, characterName, updatedAt: now() } }).run();
  }

  deleteMetaMobProfileLink(userId: string, profileId: string): void {
    this.db.delete(metamobProfileLinks).where(and(
      eq(metamobProfileLinks.ownerUserId, userId), eq(metamobProfileLinks.profileId, profileId),
    )).run();
  }

  getSharedProfile(shareToken: string): FollowedProfile | null {
    const profile = this.db.select().from(playerProfiles).where(eq(playerProfiles.shareToken, shareToken)).get();
    if (profile === undefined) return null;
    const owner = this.db.select().from(accountUsers).where(eq(accountUsers.id, profile.ownerUserId)).get();
    return owner === undefined ? null : {
      ...profileFromRow(profile, this.onlineProfileIds().has(profile.id)),
      ownerDisplayName: owner.displayName,
      ownerPictureUrl: owner.pictureUrl,
    };
  }

  private listFollowing(userId: string): FollowedProfile[] {
    const follows = this.db.select({ profileId: profileFollows.profileId }).from(profileFollows)
      .where(eq(profileFollows.followerUserId, userId)).all();
    if (follows.length === 0) return [];
    const profiles = this.db.select().from(playerProfiles).where(inArray(playerProfiles.id, follows.map((item) => item.profileId))).all();
    const ownerIds = [...new Set(profiles.map((profile) => profile.ownerUserId))];
    const onlineProfiles = this.onlineProfileIds();
    const owners = new Map(this.db.select().from(accountUsers).where(inArray(accountUsers.id, ownerIds)).all()
      .map((owner) => [owner.id, { displayName: owner.displayName, pictureUrl: owner.pictureUrl }]));
    return profiles.map((profile) => {
      const owner = owners.get(profile.ownerUserId);
      return {
        ...profileFromRow(profile, onlineProfiles.has(profile.id)),
        ownerDisplayName: owner?.displayName ?? "Joueur",
        ownerPictureUrl: owner?.pictureUrl ?? null,
      };
    });
  }
}
