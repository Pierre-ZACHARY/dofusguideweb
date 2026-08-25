CREATE TABLE account_users (
  id TEXT PRIMARY KEY NOT NULL,
  google_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  active_profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX account_users_google_subject_unique
  ON account_users(google_subject);

CREATE TABLE player_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  breed_id INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE')),
  avatar_url TEXT,
  progress_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  share_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX player_profiles_owner_idx ON player_profiles(owner_user_id);
CREATE UNIQUE INDEX player_profiles_share_token_unique
  ON player_profiles(share_token)
  WHERE share_token IS NOT NULL;

CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX account_sessions_user_idx ON account_sessions(user_id);
CREATE INDEX account_sessions_expiry_idx ON account_sessions(expires_at);

CREATE TABLE profile_follows (
  follower_user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_user_id, profile_id)
);

CREATE INDEX profile_follows_profile_idx ON profile_follows(profile_id);
