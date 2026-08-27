import { parseArgs } from "node:util";
import { enrichStepArchives } from "./questGuides/enrichStepArchives.js";
import { SqliteDofusGuideRepository } from "./repositories/sqliteDofusGuideRepository.js";

const { values } = parseArgs({ options: {
  guide: { type: "string", default: "-1" },
  step: { type: "string" },
  "step-min": { type: "string" },
  "step-max": { type: "string" },
  db: { type: "string", default: "data/dofusguide.sqlite" },
  input: { type: "string", default: "data/generated/quest-summaries" },
  "source-cache": { type: "string", default: "prompt/.cache/dofuspourlesnoobs" },
  "bestiary-catalog": { type: "string", default: "data/dofusdb/bestiary.json" },
  "item-delay-ms": { type: "string", default: "100" },
  "bestiary-image-delay-ms": { type: "string", default: "25" },
  "metadata-only": { type: "boolean", default: false },
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

const singleStep = optionalPositiveInteger(values.step, "--step");
if (singleStep !== undefined && (values["step-min"] !== undefined || values["step-max"] !== undefined)) throw new Error("--step cannot be combined with --step-min or --step-max");
const stepMin = singleStep ?? optionalPositiveInteger(values["step-min"], "--step-min");
const stepMax = singleStep ?? optionalPositiveInteger(values["step-max"], "--step-max");
if (stepMin !== undefined && stepMax !== undefined && stepMin > stepMax) throw new Error("--step-min must not be greater than --step-max");

const repository = new SqliteDofusGuideRepository(values.db);
try {
  const result = await enrichStepArchives(repository, {
    guideId: integer(values.guide, -1, "--guide"),
    inputDirectory: values.input,
    sourceCacheDirectory: values["source-cache"],
    bestiaryCatalogPath: values["bestiary-catalog"],
    itemDelayMs: integer(values["item-delay-ms"], 100, "--item-delay-ms"),
    bestiaryImageDelayMs: integer(values["bestiary-image-delay-ms"], 25, "--bestiary-image-delay-ms"),
    metadataOnly: values["metadata-only"],
    ...(stepMin === undefined ? {} : { stepMin }),
    ...(stepMax === undefined ? {} : { stepMax }),
  });
  console.info("[enrichment] " + result.filesWritten + " files · " + result.summariesProcessed + " summaries");
  console.info("[enrichment] " + result.sourceMetadataRepaired + " source metadata repaired · " + result.questReferencesResolved + " quest references resolved · " + result.itemsResolved + " items resolved");
  if (result.unresolvedItems.length > 0) {
    console.warn("[enrichment] " + result.unresolvedItems.length + " unresolved items:");
    for (const item of result.unresolvedItems) console.warn("- step " + item.stepNumber + " · " + item.questKey + " · " + item.itemName);
  }
} finally {
  repository.close();
}
