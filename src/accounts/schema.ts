import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accountUsers = sqliteTable("account_users", {
  id: text("id").primaryKey(),
  googleSubject: text("google_subject").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  pictureUrl: text("picture_url"),
  activeProfileId: text("active_profile_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("account_users_google_subject_unique").on(table.googleSubject),
]);

export const playerProfiles = sqliteTable("player_profiles", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().references(() => accountUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  breedId: integer("breed_id").notNull(),
  gender: text("gender", { enum: ["MALE", "FEMALE"] }).notNull(),
  avatarUrl: text("avatar_url"),
  progressJson: text("progress_json").notNull(),
  revision: integer("revision").notNull().default(1),
  shareToken: text("share_token"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("player_profiles_owner_idx").on(table.ownerUserId),
  uniqueIndex("player_profiles_share_token_unique").on(table.shareToken),
]);

export const accountSessions = sqliteTable("account_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => accountUsers.id, { onDelete: "cascade" }),
  activeProfileId: text("active_profile_id").references(() => playerProfiles.id, { onDelete: "set null" }),
  lastSeenAt: text("last_seen_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("account_sessions_user_idx").on(table.userId),
  index("account_sessions_expiry_idx").on(table.expiresAt),
  index("account_sessions_presence_idx").on(table.activeProfileId, table.lastSeenAt),
]);

export const profileFollows = sqliteTable("profile_follows", {
  followerUserId: text("follower_user_id").notNull().references(() => accountUsers.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => playerProfiles.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.followerUserId, table.profileId] }),
  index("profile_follows_profile_idx").on(table.profileId),
]);

export const accountSchema = { accountUsers, playerProfiles, accountSessions, profileFollows };
