import { parseArgs } from "node:util";
import { generateStaticContent } from "./web/data/generateStaticContent.js";

const { values } = parseArgs({
  options: {
    db: { type: "string", default: "data/dofusguide.sqlite" },
    output: { type: "string", default: "public/generated/dofusguide" },
  },
});

const manifest = await generateStaticContent({
  databasePath: values.db,
  outputDirectory: values.output,
});

const stepCount = manifest.guides.reduce((total, guide) => total + guide.steps.length, 0);
console.log(
  `Generated ${manifest.guides.length} guide(s), ${stepCount} step(s), and ${manifest.quests.length} quest(s) in ${values.output}`,
);
