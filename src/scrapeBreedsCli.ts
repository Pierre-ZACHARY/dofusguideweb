import { parseArgs } from "node:util";
import { scrapeDofusDbBreeds } from "./breeds/scrapeDofusDbBreeds.js";

const parsed = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    "metadata-only": { type: "boolean", default: false },
  },
});

await scrapeDofusDbBreeds({
  force: parsed.values.force,
  metadataOnly: parsed.values["metadata-only"],
});
