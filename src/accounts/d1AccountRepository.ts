import type { AccountRepository } from "./accountRepository.js";
import {
  emptyStoredProgressProfile,
  storedProgressProfileSchema,
  type AccountSession,
  type FollowedProfile,
  type GoogleIdentity,
  type PlayerProfile,
  type ProfileGender,
  type StoredProgressProfile,
} from "./types.js";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PRESENCE_WINDOW_MS = 35_000;

interface UserRow {
  id: string;
  google_subject: string;
  email: string;
  display_name: string;
  picture_url: string | null;
  active_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  id: string;
  owner_user_id: string;
  name: string;
  breed_id: number;
  gender: ProfileGender;
  avatar_url: string | null;
  progress_json: string;
  revision: number;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

interface FollowedRow extends ProfileRow {
  owner_display_name: string;
  owner_picture_url: string | null;
}

function now(): string {
  return new Date().toISOString();
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseProgress(value: string): StoredProgressProfile {
  try {
    const parsed = storedProgressProfileSchema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : emptyStoredProgressProfile();
  } catch {
    return emptyStoredProgressProfile();
  }
}

function profileFromRow(row: ProfileRow, onlineProfiles: ReadonlySet<string>): PlayerProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    breedId: row.breed_id,
    gender: row.gender,
    avatarUrl: row.avatar_url,
    progress: parseProgress(row.progress_json),
    revision: row.revision,
    shareToken: row.share_token,
    isOnline: onlineProfiles.has(row.id),
    updatedAt: row.updated_at,
  };
}

export class D1AccountRepository implements AccountRepository {
  constructor(private readonly database: D1Database) {}

  close(): void {}

  async upsertGoogleUser(identity: GoogleIdentity, initialProgress: StoredProgressProfile, avatarUrl: string | null): Promise<string> {
    const timestamp = now();
    const existing = await this.database.prepare("SELECT * FROM account_users WHERE google_subject = ?")
      .bind(identity.subject).first<UserRow>();
    if (existing !== null) {
      await this.database.prepare(`
        UPDATE account_users
        SET email = ?, display_name = ?, picture_url = ?, updated_at = ?
        WHERE id = ?
      `).bind(identity.email, identity.displayName, identity.pictureUrl, timestamp, existing.id).run();
      await this.ensureDefaultProfile(existing.id, initialProgress, avatarUrl);
      return existing.id;
    }

    const userId = crypto.randomUUID();
    await this.database.prepare(`
      INSERT INTO account_users (
        id, google_subject, email, display_name, picture_url, active_profile_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    `).bind(userId, identity.subject, identity.email, identity.displayName, identity.pictureUrl, timestamp, timestamp).run();
    await this.ensureDefaultProfile(userId, initialProgress, avatarUrl);
    return userId;
  }

  private async ensureDefaultProfile(userId: string, initialProgress: StoredProgressProfile, avatarUrl: string | null): Promise<void> {
    const profile = await this.database.prepare("SELECT id FROM player_profiles WHERE owner_user_id = ? LIMIT 1")
      .bind(userId).first<{ id: string }>();
    if (profile !== null) {
      const user = await this.database.prepare("SELECT active_profile_id FROM account_users WHERE id = ?")
        .bind(userId).first<{ active_profile_id: string | null }>();
      if (!user?.active_profile_id) await this.setActiveProfile(userId, profile.id);
      return;
    }
    const created = await this.createProfile(userId, "Mon personnage", 9, "MALE", avatarUrl, initialProgress);
    await this.setActiveProfile(userId, created.id);
  }

  async createSession(userId: string): Promise<string> {
    const token = randomToken(32);
    const timestamp = now();
    await this.database.prepare(`
      INSERT INTO account_sessions (
        token_hash, user_id, active_profile_id, last_seen_at, expires_at, created_at
      ) VALUES (?, ?, NULL, NULL, ?, ?)
    `).bind(
      await hashToken(token),
      userId,
      new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
      timestamp,
    ).run();
    return token;
  }

  async deleteSession(token: string): Promise<void> {
    await this.database.prepare("DELETE FROM account_sessions WHERE token_hash = ?")
      .bind(await hashToken(token)).run();
  }

  async userIdForSession(token: string): Promise<string | null> {
    const session = await this.database.prepare(`
      SELECT user_id FROM account_sessions WHERE token_hash = ? AND expires_at > ?
    `).bind(await hashToken(token), now()).first<{ user_id: string }>();
    return session?.user_id ?? null;
  }

  async touchSessionPresence(token: string, userId: string, profileId: string): Promise<void> {
    const owned = await this.database.prepare(`
      SELECT id FROM player_profiles WHERE id = ? AND owner_user_id = ?
    `).bind(profileId, userId).first<{ id: string }>();
    if (owned === null) throw new Error("Profil introuvable");
    const result = await this.database.prepare(`
      UPDATE account_sessions SET active_profile_id = ?, last_seen_at = ?
      WHERE token_hash = ? AND user_id = ? AND expires_at > ?
    `).bind(profileId, now(), await hashToken(token), userId, now()).run();
    if ((result.meta.changes ?? 0) === 0) throw new Error("Session expirée");
  }

  private async onlineProfileIds(): Promise<Set<string>> {
    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
    const rows = await this.database.prepare(`
      SELECT DISTINCT active_profile_id AS profile_id
      FROM account_sessions
      WHERE active_profile_id IS NOT NULL AND last_seen_at > ? AND expires_at > ?
    `).bind(cutoff, now()).all<{ profile_id: string }>();
    return new Set(rows.results.map((row) => row.profile_id));
  }

  async getAccount(userId: string): Promise<AccountSession | null> {
    const user = await this.database.prepare("SELECT * FROM account_users WHERE id = ?")
      .bind(userId).first<UserRow>();
    if (user === null) return null;
    const [profileRows, onlineProfiles, following] = await Promise.all([
      this.database.prepare("SELECT * FROM player_profiles WHERE owner_user_id = ? ORDER BY created_at")
        .bind(userId).all<ProfileRow>(),
      this.onlineProfileIds(),
      this.listFollowing(userId),
    ]);
    const profiles = profileRows.results.map((profile) => profileFromRow(profile, onlineProfiles));
    if (profiles.length === 0) return null;
    const activeProfileId = profiles.some((profile) => profile.id === user.active_profile_id)
      ? user.active_profile_id!
      : profiles[0]!.id;
    if (activeProfileId !== user.active_profile_id) await this.setActiveProfile(userId, activeProfileId);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        pictureUrl: user.picture_url,
      },
      profiles,
      activeProfileId,
      following,
    };
  }

  async createProfile(
    userId: string,
    name: string,
    breedId: number,
    gender: ProfileGender,
    avatarUrl: string | null,
    progress: StoredProgressProfile = emptyStoredProgressProfile(),
  ): Promise<PlayerProfile> {
    const timestamp = now();
    const row: ProfileRow = {
      id: crypto.randomUUID(),
      owner_user_id: userId,
      name,
      breed_id: breedId,
      gender,
      avatar_url: avatarUrl,
      progress_json: JSON.stringify(progress),
      revision: 1,
      share_token: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await this.database.prepare(`
      INSERT INTO player_profiles (
        id, owner_user_id, name, breed_id, gender, avatar_url, progress_json,
        revision, share_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id, row.owner_user_id, row.name, row.breed_id, row.gender, row.avatar_url,
      row.progress_json, row.revision, row.share_token, row.created_at, row.updated_at,
    ).run();
    return profileFromRow(row, new Set());
  }

  async setActiveProfile(userId: string, profileId: string): Promise<void> {
    const owned = await this.database.prepare("SELECT id FROM player_profiles WHERE id = ? AND owner_user_id = ?")
      .bind(profileId, userId).first<{ id: string }>();
    if (owned === null) throw new Error("Profil introuvable");
    await this.database.prepare("UPDATE account_users SET active_profile_id = ?, updated_at = ? WHERE id = ?")
      .bind(profileId, now(), userId).run();
  }

  async updateProfile(userId: string, profileId: string, name: string, breedId: number, gender: ProfileGender, avatarUrl: string | null): Promise<void> {
    const result = await this.database.prepare(`
      UPDATE player_profiles SET name = ?, breed_id = ?, gender = ?, avatar_url = ?, updated_at = ?
      WHERE id = ? AND owner_user_id = ?
    `).bind(name, breedId, gender, avatarUrl, now(), profileId, userId).run();
    if ((result.meta.changes ?? 0) === 0) throw new Error("Profil introuvable");
  }

  async saveProgress(userId: string, profileId: string, progress: StoredProgressProfile): Promise<void> {
    const result = await this.database.prepare(`
      UPDATE player_profiles
      SET progress_json = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND owner_user_id = ?
    `).bind(JSON.stringify(progress), now(), profileId, userId).run();
    if ((result.meta.changes ?? 0) === 0) throw new Error("Profil introuvable");
  }

  async enableSharing(userId: string, profileId: string): Promise<string> {
    const profile = await this.database.prepare(`
      SELECT share_token FROM player_profiles WHERE id = ? AND owner_user_id = ?
    `).bind(profileId, userId).first<{ share_token: string | null }>();
    if (profile === null) throw new Error("Profil introuvable");
    if (profile.share_token) return profile.share_token;
    const shareToken = randomToken(24);
    await this.database.prepare("UPDATE player_profiles SET share_token = ?, updated_at = ? WHERE id = ?")
      .bind(shareToken, now(), profileId).run();
    return shareToken;
  }

  async followSharedProfile(userId: string, shareToken: string): Promise<void> {
    const profile = await this.database.prepare("SELECT id, owner_user_id FROM player_profiles WHERE share_token = ?")
      .bind(shareToken).first<{ id: string; owner_user_id: string }>();
    if (profile === null) throw new Error("Partage introuvable");
    if (profile.owner_user_id === userId) return;
    await this.database.prepare(`
      INSERT INTO profile_follows (follower_user_id, profile_id, created_at)
      VALUES (?, ?, ?) ON CONFLICT (follower_user_id, profile_id) DO NOTHING
    `).bind(userId, profile.id, now()).run();
  }

  async unfollowProfile(userId: string, profileId: string): Promise<void> {
    await this.database.prepare("DELETE FROM profile_follows WHERE follower_user_id = ? AND profile_id = ?")
      .bind(userId, profileId).run();
  }

  async getSharedProfile(shareToken: string): Promise<FollowedProfile | null> {
    const row = await this.database.prepare(`
      SELECT p.*, u.display_name AS owner_display_name, u.picture_url AS owner_picture_url
      FROM player_profiles p
      JOIN account_users u ON u.id = p.owner_user_id
      WHERE p.share_token = ?
    `).bind(shareToken).first<FollowedRow>();
    if (row === null) return null;
    const onlineProfiles = await this.onlineProfileIds();
    return {
      ...profileFromRow(row, onlineProfiles),
      ownerDisplayName: row.owner_display_name,
      ownerPictureUrl: row.owner_picture_url,
    };
  }

  private async listFollowing(userId: string): Promise<FollowedProfile[]> {
    const rows = await this.database.prepare(`
      SELECT p.*, u.display_name AS owner_display_name, u.picture_url AS owner_picture_url
      FROM profile_follows f
      JOIN player_profiles p ON p.id = f.profile_id
      JOIN account_users u ON u.id = p.owner_user_id
      WHERE f.follower_user_id = ?
      ORDER BY f.created_at
    `).bind(userId).all<FollowedRow>();
    if (rows.results.length === 0) return [];
    const onlineProfiles = await this.onlineProfileIds();
    return rows.results.map((row) => ({
      ...profileFromRow(row, onlineProfiles),
      ownerDisplayName: row.owner_display_name,
      ownerPictureUrl: row.owner_picture_url,
    }));
  }
}
