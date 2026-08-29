import { parseArgs } from "node:util";
import { generateStepPrompts } from "./questGuides/generateStepPrompts.js";
import { SqliteDofusGuideRepository } from "./repositories/sqliteDofusGuideRepository.js";

const { values } = parseArgs({ options: {
  guide: { type: "string", default: "-1" },
  "step-min": { type: "string" },
  "step-max": { type: "string" },
  db: { type: "string", default: "data/dofusguide.sqlite" },
  output: { type: "string", default: "prompt/quest-tutorials" },
  cache: { type: "string", default: "prompt/.cache/dofuspourlesnoobs" },
  "delay-ms": { type: "string", default: "250" },
  "refresh-sources": { type: "boolean", default: false },
} });

function integer(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) throw new Error(name + " must be an integer");
  return parsed;
}

function optionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = integer(value, 0, name);
  if (parsed < 1) throw new Error(name + " must be a positive integer");
  return parsed;
}

const stepMin = optionalPositiveInteger(values["step-min"], "--step-min");
const stepMax = optionalPositiveInteger(values["step-max"], "--step-max");
if (stepMin !== undefined && stepMax !== undefined && stepMin > stepMax) throw new Error("--step-min must not be greater than --step-max");

const repository = new SqliteDofusGuideRepository(values.db);
try {
  const result = await generateStepPrompts(repository, {
    guideId: integer(values.guide, -1, "--guide"),
    outputDirectory: values.output,
    cacheDirectory: values.cache,
    delayMs: integer(values["delay-ms"], 250, "--delay-ms"),
    refreshSources: values["refresh-sources"],
    ...(stepMin === undefined ? {} : { stepMin }),
    ...(stepMax === undefined ? {} : { stepMax }),
  });
  console.info("[prompt] " + result.promptFiles.length + " files written");
  console.info("[prompt] " + result.sourceCount + " unique sources · " + result.fetchedSourceCount + " fetched · " + result.cachedSourceCount + " cached");
  console.info("[prompt] " + result.regenerationSteps.length + " existing tutorial steps require occurrence-aware regeneration");
  console.info("[prompt] regeneration report: " + result.regenerationReportPath);
  if (result.failures.length > 0) {
    console.warn("[prompt] " + result.failures.length + " sources unavailable; affected prompts explicitly forbid invention");
  }
} finally {
  repository.close();
}
