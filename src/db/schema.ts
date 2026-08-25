import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const guides = sqliteTable("guides", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  author: text("author"),
  imageUrl: text("image_url"),
  gifUrl: text("gif_url"),
  remoteUpdatedAt: text("remote_updated_at"),
  scrapedAt: text("scraped_at").notNull(),
  rawJson: text("raw_json").notNull(),
});

export const guideChapters = sqliteTable(
  "guide_chapters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guideId: integer("guide_id").notNull().references(() => guides.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number").notNull(),
    name: text("name").notNull(),
    rawTitle: text("raw_title").notNull(),
    recommendedLevelMin: integer("recommended_level_min"),
    recommendedLevelMax: integer("recommended_level_max"),
    startStep: integer("start_step").notNull(),
    endStep: integer("end_step").notNull(),
  },
  (table) => [
    uniqueIndex("guide_chapters_guide_number_unique").on(table.guideId, table.chapterNumber),
    index("guide_chapters_guide_steps_idx").on(table.guideId, table.startStep, table.endStep),
  ],
);

export const guideSteps = sqliteTable(
  "guide_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guideId: integer("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    chapterId: integer("chapter_id").references(() => guideChapters.id, { onDelete: "set null" }),
    stepNumber: integer("step_number").notNull(),
    recommendedLevelMin: integer("recommended_level_min"),
    recommendedLevelMax: integer("recommended_level_max"),
    title: text("title"),
    rawJson: text("raw_json").notNull(),
  },
  (table) => [
    uniqueIndex("guide_steps_guide_step_unique").on(table.guideId, table.stepNumber),
    index("guide_steps_step_number_idx").on(table.stepNumber),
  ],
);

export const guideElements = sqliteTable(
  "guide_elements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    remoteId: integer("remote_id").notNull(),
    guideId: integer("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    sortOrder: integer("sort_order").notNull(),
    elementType: text("element_type").notNull(),
    positionX: integer("position_x"),
    positionY: integer("position_y"),
    width: integer("width"),
    height: integer("height"),
    rawValueJson: text("raw_value_json").notNull(),
    rawElementJson: text("raw_element_json").notNull(),
  },
  (table) => [
    uniqueIndex("guide_elements_step_order_unique").on(
      table.guideId,
      table.stepNumber,
      table.sortOrder,
    ),
    index("guide_elements_type_idx").on(table.elementType),
    index("guide_elements_guide_step_idx").on(table.guideId, table.stepNumber),
  ],
);

export const quests = sqliteTable(
  "quests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questKey: text("quest_key").notNull(),
    sourceQuestKey: text("source_quest_key"),
    originalName: text("original_name"),
    normalizedName: text("normalized_name"),
    sequenceNumber: integer("sequence_number"),
    externalUrl: text("external_url"),
    category: text("category"),
    npcName: text("npc_name"),
    npcImageUrl: text("npc_image_url"),
    startX: integer("start_x"),
    startY: integer("start_y"),
    startMap: text("start_map"),
    travelCommand: text("travel_command"),
    rawValueJson: text("raw_value_json").notNull(),
  },
  (table) => [
    uniqueIndex("quests_quest_key_unique").on(table.questKey),
    index("quests_normalized_name_idx").on(table.normalizedName),
  ],
);

export const guideStepQuests = sqliteTable(
  "guide_step_quests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guideId: integer("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    questId: integer("quest_id")
      .notNull()
      .references(() => quests.id, { onDelete: "cascade" }),
    relationType: text("relation_type", {
      enum: ["START", "ACTIVE", "FINISH", "UNKNOWN"],
    }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("guide_step_quests_occurrence_unique").on(
      table.guideId,
      table.stepNumber,
      table.questId,
      table.relationType,
      table.sortOrder,
    ),
    index("guide_step_quests_guide_step_idx").on(table.guideId, table.stepNumber),
    index("guide_step_quests_quest_idx").on(table.questId),
  ],
);

export const schema = {
  guides,
  guideChapters,
  guideSteps,
  guideElements,
  quests,
  guideStepQuests,
};
