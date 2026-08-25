import { parseArgs } from "node:util";
import { scrapeDofusDbItems } from "./dofus/scrapeDofusDbItems.js";

const { values } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    "metadata-only": { type: "boolean", default: false },
  },
});

await scrapeDofusDbItems({
  force: values.force,
  metadataOnly: values["metadata-only"],
});
