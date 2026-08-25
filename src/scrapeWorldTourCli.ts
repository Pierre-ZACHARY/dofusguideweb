import { parseArgs } from "node:util";
import { scrapeWorldTour } from "./worldTour/scrapeWorldTour.js";

const { values } = parseArgs({
  options: {
    force: { type: "boolean", default: false },
    "metadata-only": { type: "boolean", default: false },
  },
});

await scrapeWorldTour({
  force: values.force,
  metadataOnly: values["metadata-only"],
});
