import { parseArgs } from "node:util";
import { summarizeQuestGuides, type QuestGuideTarget } from "./questGuides/summarizeQuestGuides.js";
import { SqliteDofusGuideRepository } from "./repositories/sqliteDofusGuideRepository.js";

const { values } = parseArgs({ options: {
  all: { type: "boolean", default: false },
  "quest-key": { type: "string" },
  url: { type: "string" },
  "step-min": { type: "string" },
  "step-max": { type: "string" },
  guide: { type: "string", default: "-1" },
  provider: { type: "string", default: "openai" },
  concurrency: { type: "string", default: "1" },
  "summary-timeout-ms": { type: "string", default: "660000" },
  db: { type: "string", default: "data/dofusguide.sqlite" },
  output: { type: "string", default: "prompt/legacy/quest-summaries.json" },
  model: { type: "string" },
  limit: { type: "string" },
  "delay-ms": { type: "string", default: "1000" },
  "item-delay-ms": { type: "string", default: "100" },
  "bestiary-image-delay-ms": { type: "string", default: "25" },
  "metadata-only": { type: "boolean", default: false },
  "bestiary-catalog": { type: "string", default: "data/dofusdb/bestiary.json" },
  force: { type: "boolean", default: false },
} });

function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(name + " must be a non-negative integer");
  return parsed;
}

function integer(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(name + " must be an integer");
  return parsed;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = integer(value, fallback, name);
  if (parsed < 1) throw new Error(name + " must be a positive integer");
  return parsed;
}

const hasStepRange = values["step-min"] !== undefined || values["step-max"] !== undefined;
if (hasStepRange && (values["step-min"] === undefined || values["step-max"] === undefined)) {
  throw new Error("--step-min and --step-max must be used together");
}
const selections = Number(values.all) + Number(values["quest-key"] !== undefined) + Number(values.url !== undefined) + Number(hasStepRange);
if (selections !== 1) throw new Error("Choose exactly one of --all, --quest-key, --url or --step-min/--step-max");
if (values.provider !== "openai" && values.provider !== "cline") throw new Error("--provider must be openai or cline");

const repository = new SqliteDofusGuideRepository(values.db);
console.warn("[summary] legacy per-quest generation writes an aggregate that the web app does not consume; prefer npm run generate-quest-prompts");
let targets: QuestGuideTarget[] = [];
try {
  if (values["quest-key"] !== undefined) {
    const quest = repository.getQuest(values["quest-key"]);
    if (quest === undefined || quest.externalUrl === null) throw new Error("Quest not found or has no external guide: " + values["quest-key"]);
    targets = [{ questKey: quest.questKey, sourceUrl: quest.externalUrl }];
  } else if (values.url !== undefined) {
    targets = [{ questKey: "external:" + new URL(values.url).pathname.replace(/^\/+|\.html$/gu, ""), sourceUrl: values.url }];
  } else {
    const searchScope = hasStepRange ? {
      guideId: integer(values.guide, -1, "--guide"),
      stepMin: positiveInteger(values["step-min"], 1, "--step-min"),
      stepMax: positiveInteger(values["step-max"], 1, "--step-max"),
    } : {};
    if (searchScope.stepMin !== undefined && searchScope.stepMax !== undefined && searchScope.stepMin > searchScope.stepMax) {
      throw new Error("--step-min must not be greater than --step-max");
    }
    for (let offset = 0; ; offset += 200) {
      const page = repository.searchQuests({ ...searchScope, limit: 200, offset });
      targets.push(...page.items.flatMap((quest) => quest.externalUrl === null ? [] : [{ questKey: quest.questKey, sourceUrl: quest.externalUrl }]));
      if (offset + page.items.length >= page.total) break;
    }
  }
} finally {
  repository.close();
}

targets = [...new Map(targets.map((target) => [target.sourceUrl, target])).values()]
  .slice(0, nonNegativeInteger(values.limit, targets.length, "--limit"));
if (targets.length === 0) throw new Error("No quest guides selected");
await summarizeQuestGuides(targets, {
  outputPath: values.output,
  delayMs: nonNegativeInteger(values["delay-ms"], 1_000, "--delay-ms"),
  itemDelayMs: nonNegativeInteger(values["item-delay-ms"], 100, "--item-delay-ms"),
  bestiaryImageDelayMs: nonNegativeInteger(values["bestiary-image-delay-ms"], 25, "--bestiary-image-delay-ms"),
  metadataOnly: values["metadata-only"],
  bestiaryCatalogPath: values["bestiary-catalog"],
  force: values.force,
  provider: values.provider,
  concurrency: positiveInteger(values.concurrency, 1, "--concurrency"),
  timeoutMs: positiveInteger(values["summary-timeout-ms"], 660_000, "--summary-timeout-ms"),
  ...(values.model === undefined ? {} : { model: values.model }),
});
