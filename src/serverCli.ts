import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { buildApi } from "./api/server.js";

const HELP = [
  "Usage: npm run serve -- [options]",
  "",
  "Options:",
  "  --host <host>  Listen host (default: 127.0.0.1)",
  "  --port <port>  Listen port (default: 3000)",
  "  --db <path>    SQLite database path (default: data/dofusguide.sqlite)",
  "  --help         Show this help",
].join("\n");

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error("--port must be an integer");
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port must be between 1 and 65535");
  }
  return port;
}

export async function runServerCli(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      db: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (parsed.values.help === true) {
    console.log(HELP);
    return;
  }
  const host = parsed.values.host?.trim() ?? "127.0.0.1";
  if (host === "") {
    throw new Error("--host must not be empty");
  }
  const app = buildApi({
    ...(parsed.values.db === undefined ? {} : { databasePath: parsed.values.db }),
    logger: true,
  });
  const close = (): void => {
    void app.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  try {
    const address = await app.listen({ host, port: parsePort(parsed.values.port) });
    console.log("DofusGuide API listening on " + address);
  } catch (error) {
    await app.close();
    throw error;
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entrypoint)).href
) {
  runServerCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[error] " + message);
    process.exitCode = 1;
  });
}
