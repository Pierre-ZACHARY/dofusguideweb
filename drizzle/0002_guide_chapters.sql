CREATE TABLE guide_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  raw_title TEXT NOT NULL,
  recommended_level_min INTEGER,
  recommended_level_max INTEGER,
  start_step INTEGER NOT NULL,
  end_step INTEGER NOT NULL
);

CREATE UNIQUE INDEX guide_chapters_guide_number_unique
  ON guide_chapters(guide_id, chapter_number);
CREATE INDEX guide_chapters_guide_steps_idx
  ON guide_chapters(guide_id, start_step, end_step);

ALTER TABLE guide_steps ADD COLUMN chapter_id INTEGER
  REFERENCES guide_chapters(id) ON DELETE SET NULL;
CREATE INDEX guide_steps_chapter_idx ON guide_steps(chapter_id);
