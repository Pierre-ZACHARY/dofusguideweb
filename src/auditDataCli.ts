import { parseArgs } from "node:util";
import path from "node:path";
import { auditRawData, formatAuditReport } from "./audit/auditData.js";

const { values } = parseArgs({
  options: {
    "raw-dir": { type: "string", default: "data/raw" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log("Usage: npm run audit-data -- [--raw-dir data/raw] [--json]");
} else {
  const report = await auditRawData(path.resolve(values["raw-dir"]));
  console.log(values.json ? JSON.stringify(report, null, 2) : formatAuditReport(report));
}
