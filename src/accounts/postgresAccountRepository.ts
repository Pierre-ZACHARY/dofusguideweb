import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
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
const MIGRATION_NAME = /^\d+[_-].+\.sql$/u;

interface AccountUserRow {
  id: string;
  google_subject: string;
  email: string;
  display_name: string;
  picture_url: string | null;
  active_profile_id: string | null;
}

interface PlayerProfileRow {
  id: string;
  owner_user_id: string;
  name: string;
  breed_id: number;
  gender: ProfileGender;
  avatar_url: string | null;
  server_id: number | null;
  server_name: string | null;
  dofus_verified_at: string | null;
  progress_json: string;
  revision: number;
  share_token: string | null;
  updated_at: string;
}

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

function profileFromRow(row: PlayerProfileRow, isOnline = false): PlayerProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    breedId: row.breed_id,
    gender: row.gender,
    avatarUrl: row.avatar_url,
    serverId: row.server_id,
    serverName: row.server_name,
    dofusVerifiedAt: row.dofus_verified_at,
    progress: parseProgress(row.progress_json),
    revision: row.revision,
    shareToken: row.share_token,
    isOnline,
    updatedAt: row.updated_at,
  };
}

async function applyMigrations(database: Sql, migrationsDirectory: string): Promise<void> {
  await database.unsafe(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );

  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const alreadyApplied = await database<{ name: string }[]>`SELECT name FROM schema_migrations`;
  const appliedNames = new Set(alreadyApplied.map((row) => row.name));

  for (const name of migrations) {
    if (appliedNames.has(name)) continue;
    const migrationSql = readFileSync(path.join(migrationsDirectory, name), "utf8");
    await database.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
      await transaction`INSERT INTO schema_migrations (name, applied_at) VALUES (${name}, ${now()})`;
    });
  }
}

export class PostgresAccountRepository {
  private constructor(private readonly database: Sql) {}

  static async create(
    databaseUrl: string,
    migrationsDirectory = "drizzle-user",
  ): Promise<PostgresAccountRepository> {
    const database = postgres(databaseUrl, { prepare: false, max: 10 });
    try {
      await applyMigrations(database, path.resolve(migrationsDirectory));
      return new PostgresAccountRepository(database);
    } catch (error) {
      await database.end({ timeout: 5 });
      throw new Error("Unable to initialize account database", { cause: error });
    }
  }

  close(): void {}

  private async ensureDefaultProfile(userId: string, initialProgress: StoredProgressProfile, avatarUrl: string | null): Promise<void> {
    const profiles = await this.database<{ id: string }[]>`
      SELECT id FROM player_profiles WHERE owner_user_id = ${userId}
    `;
    if (profiles.length > 0) {
      const user = (await this.database<AccountUserRow[]>`
        SELECT id, google_subject, email, display_name, picture_url, active_profile_id
        FROM account_users
        WHERE id = ${userId}
        LIMIT 1
      `)[0];
      if (user && !user.active_profile_id) await this.setActiveProfile(userId, profiles[0]!.id);
      return;
    }
    const profile = await this.createProfile(userId, "Mon personnage", 9, "MALE", avatarUrl, initialProgress);
    await this.setActiveProfile(userId, profile.id);
  }

  async upsertGoogleUser(identity: GoogleIdentity, initialProgress: StoredProgressProfile, avatarUrl: string | null): Promise<string> {
    const timestamp = now();
    const existing = (await this.database<AccountUserRow[]>`
      SELECT id, google_subject, email, display_name, picture_url, active_profile_id
      FROM account_users
      WHERE google_subject = ${identity.subject}
      LIMIT 1
    `)[0];
    if (existing !== undefined) {
      await this.database`
        UPDATE account_users
        SET
          email = ${identity.email},
          display_name = ${identity.displayName},
          picture_url = ${identity.pictureUrl},
          updated_at = ${timestamp}
        WHERE id = ${existing.id}
      `;
      await this.ensureDefaultProfile(existing.id, initialProgress, avatarUrl);
      return existing.id;
    }
    const userId = randomUUID();
    await this.database`
      INSERT INTO account_users (
        id, google_subject, email, display_name, picture_url, active_profile_id, created_at, updated_at
      ) VALUES (
        ${userId}, ${identity.subject}, ${identity.email}, ${identity.displayName}, ${identity.pictureUrl},
        NULL, ${timestamp}, ${timestamp}
      )
    `;
    await this.ensureDefaultProfile(userId, initialProgress, avatarUrl);
    return userId;
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const timestamp = now();
    await this.database`
      INSERT INTO account_sessions (
        token_hash, user_id, active_profile_id, last_seen_at, created_at, expires_at
      ) VALUES (
        ${hashToken(token)}, ${userId}, NULL, NULL, ${timestamp},
        ${new Date(Date.now() + SESSION_DURATION_MS).toISOString()}
      )
    `;
    return token;
  }

  async deleteSession(token: string): Promise<void> {
    await this.database`DELETE FROM account_sessions WHERE token_hash = ${hashToken(token)}`;
  }

  async userIdForSession(token: string): Promise<string | null> {
    const session = (await this.database<{ user_id: string }[]>`
      SELECT user_id
      FROM account_sessions
      WHERE token_hash = ${hashToken(token)} AND expires_at > ${now()}
      LIMIT 1
    `)[0];
    return session?.user_id ?? null;
  }

  async touchSessionPresence(token: string, userId: string, profileId: string): Promise<void> {
    const owned = (await this.database<{ id: string }[]>`
      SELECT id
      FROM player_profiles
      WHERE id = ${profileId} AND owner_user_id = ${userId}
      LIMIT 1
    `)[0];
    if (owned === undefined) throw new Error("Profil introuvable");
    const changed = await this.database`
      UPDATE account_sessions
      SET active_profile_id = ${profileId}, last_seen_at = ${now()}
      WHERE token_hash = ${hashToken(token)} AND user_id = ${userId} AND expires_at > ${now()}
    `;
    if (changed.count === 0) throw new Error("Session expirée");
  }

  private async onlineProfileIds(): Promise<Set<string>> {
    const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
    const rows = await this.database<{ active_profile_id: string | null }[]>`
      SELECT active_profile_id
      FROM account_sessions
      WHERE last_seen_at > ${cutoff} AND expires_at > ${now()}
    `;
    return new Set(rows.flatMap((row) => row.active_profile_id ? [row.active_profile_id] : []));
  }

  async getAccount(userId: string): Promise<AccountSession | null> {
    const user = (await this.database<AccountUserRow[]>`
      SELECT id, google_subject, email, display_name, picture_url, active_profile_id
      FROM account_users
      WHERE id = ${userId}
      LIMIT 1
    `)[0];
    if (user === undefined) return null;
    const onlineProfiles = await this.onlineProfileIds();
    const profiles = (await this.database<PlayerProfileRow[]>`
      SELECT
        id, owner_user_id, name, breed_id, gender, avatar_url, server_id, server_name,
        dofus_verified_at, progress_json, revision, share_token, updated_at
      FROM player_profiles
      WHERE owner_user_id = ${userId}
    `).map((profile) => profileFromRow(profile, onlineProfiles.has(profile.id)));
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
      following: await this.listFollowing(userId),
    };
  }

  async createProfile(
    userId: string,
    name: string,
    breedId: number,
    gender: ProfileGender,
    avatarUrl: string | null,
    progress: StoredProgressProfile = emptyStoredProgressProfile(),
    dofusIdentity: VerifiedDofusIdentity | null = null,
  ): Promise<PlayerProfile> {
    const timestamp = now();
    const row: PlayerProfileRow = {
      id: randomUUID(),
      owner_user_id: userId,
      name,
      breed_id: breedId,
      gender,
      avatar_url: avatarUrl,
      server_id: dofusIdentity?.serverId ?? null,
      server_name: dofusIdentity?.serverName ?? null,
      dofus_verified_at: dofusIdentity?.verifiedAt ?? null,
      progress_json: JSON.stringify(progress),
      revision: 1,
      share_token: null,
      updated_at: timestamp,
    };
    await this.database`
      INSERT INTO player_profiles (
        id, owner_user_id, name, breed_id, gender, avatar_url, server_id, server_name,
        dofus_verified_at, progress_json, revision, share_token, created_at, updated_at
      ) VALUES (
        ${row.id}, ${row.owner_user_id}, ${row.name}, ${row.breed_id}, ${row.gender},
        ${row.avatar_url}, ${row.server_id}, ${row.server_name}, ${row.dofus_verified_at},
        ${row.progress_json}, ${row.revision}, ${row.share_token}, ${timestamp}, ${row.updated_at}
      )
    `;
    return profileFromRow(row);
  }

  async setActiveProfile(userId: string, profileId: string): Promise<void> {
    const owned = (await this.database<{ id: string }[]>`
      SELECT id
      FROM player_profiles
      WHERE id = ${profileId} AND owner_user_id = ${userId}
      LIMIT 1
    `)[0];
    if (owned === undefined) throw new Error("Profil introuvable");
    await this.database`
      UPDATE account_users
      SET active_profile_id = ${profileId}, updated_at = ${now()}
      WHERE id = ${userId}
    `;
  }

  async updateProfile(userId: string, profileId: string, name: string, breedId: number, gender: ProfileGender, avatarUrl: string | null, dofusIdentity: VerifiedDofusIdentity | null): Promise<void> {
    const changed = await this.database`
      UPDATE player_profiles
      SET
        name = ${name},
        breed_id = ${breedId},
        gender = ${gender},
        avatar_url = ${avatarUrl},
        server_id = ${dofusIdentity?.serverId ?? null},
        server_name = ${dofusIdentity?.serverName ?? null},
        dofus_verified_at = ${dofusIdentity?.verifiedAt ?? null},
        updated_at = ${now()}
      WHERE id = ${profileId} AND owner_user_id = ${userId}
    `;
    if (changed.count === 0) throw new Error("Profil introuvable");
  }

  async saveProgress(userId: string, profileId: string, progress: StoredProgressProfile): Promise<void> {
    const changed = await this.database`
      UPDATE player_profiles
      SET
        progress_json = ${JSON.stringify(progress)},
        revision = revision + 1,
        updated_at = ${now()}
      WHERE id = ${profileId} AND owner_user_id = ${userId}
    `;
    if (changed.count === 0) throw new Error("Profil introuvable");
  }

  async enableSharing(userId: string, profileId: string): Promise<string> {
    const profile = (await this.database<{ id: string; share_token: string | null }[]>`
      SELECT id, share_token
      FROM player_profiles
      WHERE id = ${profileId} AND owner_user_id = ${userId}
      LIMIT 1
    `)[0];
    if (profile === undefined) throw new Error("Profil introuvable");
    if (profile.share_token) return profile.share_token;
    const shareToken = randomBytes(24).toString("base64url");
    await this.database`
      UPDATE player_profiles
      SET share_token = ${shareToken}, updated_at = ${now()}
      WHERE id = ${profileId}
    `;
    return shareToken;
  }

  async followSharedProfile(userId: string, shareToken: string): Promise<void> {
    const profile = (await this.database<{ id: string; owner_user_id: string }[]>`
      SELECT id, owner_user_id
      FROM player_profiles
      WHERE share_token = ${shareToken}
      LIMIT 1
    `)[0];
    if (profile === undefined) throw new Error("Partage introuvable");
    if (profile.owner_user_id === userId) return;
    await this.database`
      INSERT INTO profile_follows (follower_user_id, profile_id, created_at)
      VALUES (${userId}, ${profile.id}, ${now()})
      ON CONFLICT DO NOTHING
    `;
  }

  async unfollowProfile(userId: string, profileId: string): Promise<void> {
    await this.database`
      DELETE FROM profile_follows
      WHERE follower_user_id = ${userId} AND profile_id = ${profileId}
    `;
  }

  async getMetaMobCredential(userId: string): Promise<StoredMetaMobCredential | null> {
    const row = (await this.database<{ user_id: string; username: string; encrypted_api_key: string; encryption_iv: string; updated_at: string }[]>`
      SELECT user_id, username, encrypted_api_key, encryption_iv, updated_at
      FROM metamob_credentials WHERE user_id = ${userId} LIMIT 1
    `)[0];
    return row === undefined ? null : {
      userId: row.user_id, username: row.username, encryptedApiKey: row.encrypted_api_key,
      encryptionIv: row.encryption_iv, updatedAt: row.updated_at,
    };
  }

  async saveMetaMobCredential(userId: string, username: string, encryptedApiKey: string, encryptionIv: string): Promise<void> {
    await this.database`
      INSERT INTO metamob_credentials (user_id, username, encrypted_api_key, encryption_iv, updated_at)
      VALUES (${userId}, ${username}, ${encryptedApiKey}, ${encryptionIv}, ${now()})
      ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username,
        encrypted_api_key = EXCLUDED.encrypted_api_key, encryption_iv = EXCLUDED.encryption_iv,
        updated_at = EXCLUDED.updated_at
    `;
  }

  async getMetaMobProfileLink(userId: string, profileId: string): Promise<MetaMobProfileLink | null> {
    const row = (await this.database<{ profile_id: string; owner_user_id: string; quest_slug: string; character_name: string; updated_at: string }[]>`
      SELECT profile_id, owner_user_id, quest_slug, character_name, updated_at
      FROM metamob_profile_links WHERE owner_user_id = ${userId} AND profile_id = ${profileId} LIMIT 1
    `)[0];
    return row === undefined ? null : {
      profileId: row.profile_id, ownerUserId: row.owner_user_id, questSlug: row.quest_slug,
      characterName: row.character_name, updatedAt: row.updated_at,
    };
  }

  async saveMetaMobProfileLink(userId: string, profileId: string, questSlug: string, characterName: string): Promise<void> {
    const owned = (await this.database<{ id: string }[]>`
      SELECT id FROM player_profiles WHERE id = ${profileId} AND owner_user_id = ${userId} LIMIT 1
    `)[0];
    if (owned === undefined) throw new Error("Profil introuvable");
    await this.database`
      INSERT INTO metamob_profile_links (profile_id, owner_user_id, quest_slug, character_name, updated_at)
      VALUES (${profileId}, ${userId}, ${questSlug}, ${characterName}, ${now()})
      ON CONFLICT (profile_id) DO UPDATE SET quest_slug = EXCLUDED.quest_slug,
        character_name = EXCLUDED.character_name, updated_at = EXCLUDED.updated_at
    `;
  }

  async deleteMetaMobProfileLink(userId: string, profileId: string): Promise<void> {
    await this.database`
      DELETE FROM metamob_profile_links WHERE owner_user_id = ${userId} AND profile_id = ${profileId}
    `;
  }

  async getSharedProfile(shareToken: string): Promise<FollowedProfile | null> {
    const profile = (await this.database<PlayerProfileRow[]>`
      SELECT
        id, owner_user_id, name, breed_id, gender, avatar_url, server_id, server_name,
        dofus_verified_at, progress_json, revision, share_token, updated_at
      FROM player_profiles
      WHERE share_token = ${shareToken}
      LIMIT 1
    `)[0];
    if (profile === undefined) return null;
    const owner = (await this.database<{ id: string; display_name: string; picture_url: string | null }[]>`
      SELECT id, display_name, picture_url
      FROM account_users
      WHERE id = ${profile.owner_user_id}
      LIMIT 1
    `)[0];
    if (owner === undefined) return null;
    return {
      ...profileFromRow(profile, (await this.onlineProfileIds()).has(profile.id)),
      ownerDisplayName: owner.display_name,
      ownerPictureUrl: owner.picture_url,
    };
  }

  private async listFollowing(userId: string): Promise<FollowedProfile[]> {
    const follows = await this.database<{ profile_id: string }[]>`
      SELECT profile_id FROM profile_follows WHERE follower_user_id = ${userId}
    `;
    if (follows.length === 0) return [];
    const profileIds = follows.map((item) => item.profile_id);
    const profiles = await this.database<PlayerProfileRow[]>`
      SELECT
        id, owner_user_id, name, breed_id, gender, avatar_url, server_id, server_name,
        dofus_verified_at, progress_json, revision, share_token, updated_at
      FROM player_profiles
      WHERE id IN ${this.database(profileIds)}
    `;
    const ownerIds = [...new Set(profiles.map((profile) => profile.owner_user_id))];
    const onlineProfiles = await this.onlineProfileIds();
    const owners = ownerIds.length === 0
      ? new Map<string, { displayName: string; pictureUrl: string | null }>()
      : new Map((await this.database<{ id: string; display_name: string; picture_url: string | null }[]>`
          SELECT id, display_name, picture_url
          FROM account_users
          WHERE id IN ${this.database(ownerIds)}
        `).map((owner) => [owner.id, { displayName: owner.display_name, pictureUrl: owner.picture_url }]));
    return profiles.map((profile) => {
      const owner = owners.get(profile.owner_user_id);
      return {
        ...profileFromRow(profile, onlineProfiles.has(profile.id)),
        ownerDisplayName: owner?.displayName ?? "Joueur",
        ownerPictureUrl: owner?.pictureUrl ?? null,
      };
    });
  }
}
