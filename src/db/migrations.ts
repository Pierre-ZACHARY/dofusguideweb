import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

const MIGRATION_NAME = /^\d+[_-].+\.sql$/u;

export function applyMigrations(
  database: Database.Database,
  migrationsDirectory: string,
): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )`,
  );

  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const alreadyApplied = database
    .prepare("SELECT name FROM schema_migrations")
    .all()
    .map((row) => (row as { name: string }).name);
  const appliedNames = new Set(alreadyApplied);

  for (const name of migrations) {
    if (appliedNames.has(name)) {
      continue;
    }
    const sql = readFileSync(path.join(migrationsDirectory, name), "utf8");
    database.transaction(() => {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
        .run(name, new Date().toISOString());
    })();
  }
}
