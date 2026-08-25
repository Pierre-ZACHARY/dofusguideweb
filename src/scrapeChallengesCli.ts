import { parseArgs } from "node:util";
import { scrapeDofusDbChallenges } from "./challenges/scrapeDofusDbChallenges.js";

const { values } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    "metadata-only": { type: "boolean", default: false },
    "page-delay-ms": { type: "string", default: "250" },
    "image-delay-ms": { type: "string", default: "25" },
  },
});

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(name + " must be a non-negative integer");
  return parsed;
}

await scrapeDofusDbChallenges({
  force: values.force,
  metadataOnly: values["metadata-only"],
  pageDelayMs: positiveInteger(values["page-delay-ms"], "--page-delay-ms"),
  imageDelayMs: positiveInteger(values["image-delay-ms"], "--image-delay-ms"),
});
