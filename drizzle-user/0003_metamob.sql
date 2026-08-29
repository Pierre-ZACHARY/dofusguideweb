CREATE TABLE metamob_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE metamob_profile_links (
  profile_id TEXT PRIMARY KEY NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  quest_slug TEXT NOT NULL,
  character_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX metamob_profile_links_owner_idx ON metamob_profile_links(owner_user_id);
CREATE UNIQUE INDEX metamob_profile_links_owner_quest_unique
  ON metamob_profile_links(owner_user_id, quest_slug);
