import { parseArgs } from "node:util";

import { importRawDatabase } from "./db/importRaw.js";

const HELP = `Usage: npm run import-db -- [options]

Options:
  --raw-dir <path>         Raw archive directory (default: data/raw)
  --db <path>              SQLite output path (default: data/dofusguide.sqlite)
  --migrations-dir <path>  SQL migrations directory (default: drizzle)
  --help                   Show this help
`;

export async function runImportDbCli(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      "raw-dir": { type: "string" },
      db: { type: "string" },
      "migrations-dir": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (parsed.values.help === true) {
    console.log(HELP);
    return;
  }

  const result = await importRawDatabase({
    ...(parsed.values["raw-dir"] === undefined
      ? {}
      : { rawDirectory: parsed.values["raw-dir"] }),
    ...(parsed.values.db === undefined ? {} : { databasePath: parsed.values.db }),
    ...(parsed.values["migrations-dir"] === undefined
      ? {}
      : { migrationsDirectory: parsed.values["migrations-dir"] }),
  });

  console.log("");
  console.log("Database import complete");
  console.log(`Guides: ${result.guidesImported}`);
  console.log(`Steps: ${result.stepsImported}`);
  console.log(`Elements: ${result.elementsImported}`);
  console.log(`Quests: ${result.questsImported}`);
  console.log(`Quest occurrences: ${result.questOccurrencesImported}`);
  console.log(`Output: ${result.databasePath}`);
}

runImportDbCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${message}`);
  process.exitCode = 1;
});
