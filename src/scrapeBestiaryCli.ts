import { parseArgs } from "node:util";
import { scrapeDofusDbBestiary } from "./bestiary/scrapeDofusDbBestiary.js";
import { rebuildBestiaryCatalog } from "./bestiary/rebuildBestiaryCatalog.js";

const { values } = parseArgs({ options: {
  "page-delay-ms": { type: "string", default: "200" },
  "page-size": { type: "string", default: "50" },
  "timeout-ms": { type: "string", default: "30000" },
  output: { type: "string", default: "data/dofusdb" },
  "from-raw": { type: "boolean", default: false },
} });

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(name + " must be a positive integer");
  return parsed;
}

if (values["from-raw"]) {
  await rebuildBestiaryCatalog(values.output);
} else await scrapeDofusDbBestiary({
  outputDirectory: values.output,
  pageDelayMs: positiveInteger(values["page-delay-ms"], "--page-delay-ms"),
  pageSize: positiveInteger(values["page-size"], "--page-size"),
  timeoutMs: positiveInteger(values["timeout-ms"], "--timeout-ms"),
});
