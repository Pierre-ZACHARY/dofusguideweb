import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { auditDplnSourceHashes } from "./questGuides/auditDplnSourceHashes.js";

const { values } = parseArgs({ options: {
  input: { type: "string", default: "data/generated/quest-summaries/-1" },
  output: { type: "string", default: "data/generated/dofuspourlesnoobs-source-hashes.json" },
  db: { type: "string", default: "data/dofusguide.sqlite" },
  "delay-ms": { type: "string", default: "250" },
} });

const delayMs = Number(values["delay-ms"]);
if (!Number.isInteger(delayMs) || delayMs < 0) throw new Error("--delay-ms must be a non-negative integer");

const report = await auditDplnSourceHashes({
  inputDirectory: values.input,
  outputPath: values.output,
  delayMs,
  databasePath: values.db,
});

console.info("[dpln hashes] " + report.sourceCount + " sources checked");
console.info("[dpln hashes] " + report.staleSourceCount + " sources and " + report.staleSteps.length + " steps require regeneration");

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const staleSteps = report.staleSteps.length === 0 ? "Aucune" : report.staleSteps.join(", ");
  await appendFile(summaryPath, [
    "## Sources DofusPourLesNoobs",
    "",
    "- Sources vérifiées : " + report.sourceCount,
    "- Sources à régénérer : " + report.staleSourceCount,
    "- Étapes concernées : " + staleSteps,
    "",
  ].join("\n"), "utf8");
}
