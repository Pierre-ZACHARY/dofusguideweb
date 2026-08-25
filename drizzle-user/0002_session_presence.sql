ALTER TABLE account_sessions ADD COLUMN active_profile_id TEXT REFERENCES player_profiles(id) ON DELETE SET NULL;
ALTER TABLE account_sessions ADD COLUMN last_seen_at TEXT;

CREATE INDEX account_sessions_presence_idx
  ON account_sessions(active_profile_id, last_seen_at);
