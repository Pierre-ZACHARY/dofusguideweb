import { mkdir } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { applyMigrations } from "../../src/db/migrations.js";

export async function createQueryDatabase(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const databasePath = path.join(root, "queries.sqlite");
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    applyMigrations(database, path.resolve("drizzle"));
    database.transaction(() => {
      const insertGuide = database.prepare(
        [
          "INSERT INTO guides",
          "(id, name, author, remote_updated_at, scraped_at, raw_json)",
          "VALUES (?, ?, ?, ?, ?, ?)",
        ].join(" "),
      );
      insertGuide.run(
        -1,
        "Guide Principal (Mono/Multi)",
        "Magem",
        "2025-09-17T17:37:31.000Z",
        "2026-08-24T05:00:00.000Z",
        JSON.stringify({ id: -1, name: "Guide Principal (Mono/Multi)", extra: true }),
      );
      insertGuide.run(
        2,
        "Guide secondaire",
        null,
        null,
        "2026-08-24T05:00:00.000Z",
        JSON.stringify({ id: 2, name: "Guide secondaire" }),
      );

      const insertStep = database.prepare(
        [
          "INSERT INTO guide_steps",
          "(guide_id, step_number, title, raw_json)",
          "VALUES (?, ?, ?, ?)",
        ].join(" "),
      );
      insertStep.run(-1, 100, "Étape 100", "[]");
      insertStep.run(
        -1,
        111,
        "8. Affaires de fromage",
        JSON.stringify([{ type: "TEXTE", valeur: "8. Affaires de fromage" }]),
      );
      insertStep.run(-1, 120, "Étape 120", "[]");
      insertStep.run(2, 10, "Étape secondaire", "[]");

      database
        .prepare(
          [
            "INSERT INTO guide_elements",
            "(remote_id, guide_id, step_number, sort_order, element_type,",
            "position_x, position_y, raw_value_json, raw_element_json)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
        )
        .run(
          15851,
          -1,
          111,
          0,
          "TEXTE",
          10,
          20,
          JSON.stringify("8. Affaires de fromage"),
          JSON.stringify({
            id: 15851,
            type: "TEXTE",
            valeur: "8. Affaires de fromage",
            unknown: "preserved",
          }),
        );

      const insertQuest = database.prepare(
        [
          "INSERT INTO quests",
          "(quest_key, source_quest_key, original_name, normalized_name,",
          "sequence_number, category, npc_name, start_x, start_y, raw_value_json)",
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
      );
      insertQuest.run(
        "quest:132",
        "quest:132",
        "47. Bouc à misère",
        "bouc a misere",
        47,
        "ALI",
        "Amayiro",
        -32,
        -57,
        JSON.stringify({ id: "quest:132", custom: true }),
      );
      insertQuest.run(
        "quest:133",
        "quest:133",
        "48. Flagrant délire",
        "flagrant delire",
        48,
        "ALI",
        "Amayiro",
        -32,
        -57,
        JSON.stringify({ id: "quest:133" }),
      );
      insertQuest.run(
        "quest:200",
        "quest:200",
        "3. Autre quête",
        "autre quete",
        3,
        "TDM",
        null,
        1,
        2,
        JSON.stringify({ id: "quest:200" }),
      );

      const questIds = database
        .prepare("SELECT id, quest_key AS questKey FROM quests")
        .all() as Array<{ id: number; questKey: string }>;
      const byKey = new Map(questIds.map((row) => [row.questKey, row.id]));
      const insertRelation = database.prepare(
        [
          "INSERT INTO guide_step_quests",
          "(guide_id, step_number, quest_id, relation_type, sort_order)",
          "VALUES (?, ?, ?, ?, ?)",
        ].join(" "),
      );
      insertRelation.run(-1, 111, byKey.get("quest:132"), "ACTIVE", 0);
      insertRelation.run(-1, 111, byKey.get("quest:133"), "START", 1);
      insertRelation.run(-1, 120, byKey.get("quest:200"), "FINISH", 0);
      insertRelation.run(2, 10, byKey.get("quest:200"), "ACTIVE", 0);
    })();
  } finally {
    database.close();
  }
  return databasePath;
}
