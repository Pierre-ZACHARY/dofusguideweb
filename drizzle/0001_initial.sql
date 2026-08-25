CREATE TABLE guides (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  author TEXT,
  image_url TEXT,
  gif_url TEXT,
  remote_updated_at TEXT,
  scraped_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE guide_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  recommended_level_min INTEGER,
  recommended_level_max INTEGER,
  title TEXT,
  raw_json TEXT NOT NULL
);

CREATE UNIQUE INDEX guide_steps_guide_step_unique
  ON guide_steps(guide_id, step_number);
CREATE INDEX guide_steps_step_number_idx
  ON guide_steps(step_number);

CREATE TABLE guide_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  remote_id INTEGER NOT NULL,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  element_type TEXT NOT NULL,
  position_x INTEGER,
  position_y INTEGER,
  width INTEGER,
  height INTEGER,
  raw_value_json TEXT NOT NULL,
  raw_element_json TEXT NOT NULL
);

CREATE UNIQUE INDEX guide_elements_step_order_unique
  ON guide_elements(guide_id, step_number, sort_order);
CREATE INDEX guide_elements_type_idx
  ON guide_elements(element_type);
CREATE INDEX guide_elements_guide_step_idx
  ON guide_elements(guide_id, step_number);

CREATE TABLE quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  quest_key TEXT NOT NULL,
  source_quest_key TEXT,
  original_name TEXT,
  normalized_name TEXT,
  sequence_number INTEGER,
  external_url TEXT,
  category TEXT,
  npc_name TEXT,
  npc_image_url TEXT,
  start_x INTEGER,
  start_y INTEGER,
  start_map TEXT,
  travel_command TEXT,
  raw_value_json TEXT NOT NULL
);

CREATE UNIQUE INDEX quests_quest_key_unique
  ON quests(quest_key);
CREATE INDEX quests_normalized_name_idx
  ON quests(normalized_name);

CREATE TABLE guide_step_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (
    relation_type IN ('START', 'ACTIVE', 'FINISH', 'UNKNOWN')
  ),
  sort_order INTEGER NOT NULL
);

CREATE UNIQUE INDEX guide_step_quests_occurrence_unique
  ON guide_step_quests(
    guide_id,
    step_number,
    quest_id,
    relation_type,
    sort_order
  );
CREATE INDEX guide_step_quests_guide_step_idx
  ON guide_step_quests(guide_id, step_number);
CREATE INDEX guide_step_quests_quest_idx
  ON guide_step_quests(quest_id);
