import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { QueryService } from "./db/queryService.js";

const HELP = [
  "Usage: npm run query -- quest <name> [options]",
  "",
  "Options:",
  "  --db <path>     SQLite database path (default: data/dofusguide.sqlite)",
  "  --limit <count> Maximum results, from 1 to 200 (default: 50)",
  "  --help          Show this help",
].join("\n");

function parseLimit(value: string | undefined): number {
  if (value === undefined) {
    return 50;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error("--limit must be an integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new Error("--limit must be between 1 and 200");
  }
  return parsed;
}

export async function runQueryCli(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      db: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (parsed.values.help === true) {
    console.log(HELP);
    return;
  }
  const [command, ...terms] = parsed.positionals;
  if (command !== "quest" || terms.length === 0) {
    throw new Error(HELP);
  }
  const query = terms.join(" ").trim();
  if (query === "") {
    throw new Error("Quest name must not be empty");
  }
  const service = new QueryService(parsed.values.db);
  try {
    const result = service.searchQuests({
      q: query,
      limit: parseLimit(parsed.values.limit),
      offset: 0,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    service.close();
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entrypoint)).href
) {
  runQueryCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[error] " + message);
    process.exitCode = 1;
  });
}
