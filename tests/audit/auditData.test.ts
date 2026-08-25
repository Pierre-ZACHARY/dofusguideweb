import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditRawData, formatAuditReport } from "../../src/audit/auditData.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("data audit", () => {
  it("audits archives without changing them and reports isolated anomalies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dofusguide-audit-"));
    temporaryDirectories.push(root);
    const steps = path.join(root, "guides", "-1", "steps");
    await mkdir(steps, { recursive: true });
    const body = JSON.stringify([
      { id: 1, tuto_id: -1, name: "Guide", etape: 1, type: "TEXTE", valeur: "<fc=1,2,3>1. Départ</fc=1,2,3>", pos: { pos_x: "10", pos_y: 20 } },
      { id: 2, tuto_id: -1, name: "Guide", etape: 1, type: "FUTURE", valeur: null, pos: { pos_x: 0, pos_y: 10 } },
    ]);
    await writeFile(path.join(steps, "0001.json"), body, "utf8");

    const report = await auditRawData(root);

    expect(report).toMatchObject({ guides: 1, steps: 1, elements: 2, stepsWithDifferentVisualOrder: 1 });
    expect(report.elementTypes).toEqual({ TEXTE: 1, FUTURE: 1 });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ kind: "UNKNOWN_ELEMENT_TYPE" }));
    expect(await (await import("node:fs/promises")).readFile(path.join(steps, "0001.json"), "utf8")).toBe(body);
    expect(formatAuditReport(report)).toContain("UNKNOWN_ELEMENT_TYPE");
  });
});
