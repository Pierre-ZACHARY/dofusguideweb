import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { GuideElement } from "../types/dofusGuide.js";
import { classifyGuideElementType, orderGuideElementsVisually } from "../shared/guideAnalysis.js";

export interface DataAuditDiagnostic {
  kind: "UNKNOWN_ELEMENT_TYPE" | "MALFORMED_QUEST_VALUE" | "MISSING_ID" | "DUPLICATE_ELEMENT_ID" | "INVALID_POSITION" | "STEP_MISMATCH";
  guideId: number;
  stepNumber: number;
  elementIndex: number;
  detail: string;
}

export interface DataAuditReport {
  guides: number;
  steps: number;
  emptySteps: number;
  elements: number;
  elementTypes: Record<string, number>;
  valueKindsByElementType: Record<string, Record<string, number>>;
  nestedValueTypes: Record<string, number>;
  positionKinds: Record<string, number>;
  fontKinds: Record<string, number>;
  stepsWithDifferentVisualOrder: number;
  markup: { strings: number; tags: number; malformedStrings: number };
  diagnostics: DataAuditDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function isCoordinate(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || value.trim() === "") return false;
  return Number.isFinite(Number(value));
}

function isQuestElement(type: string): boolean {
  return type === "QUEST" || type === "QUEST_START" || type === "QUEST_FINISH";
}

function inspectMarkup(value: unknown, report: DataAuditReport): void {
  if (typeof value !== "string" || !value.includes("<fc")) return;
  report.markup.strings += 1;
  const tokens = value.match(/<\/?fc(?:=[^>]*)?>/giu) ?? [];
  report.markup.tags += tokens.length;
  let depth = 0;
  let malformed = false;
  for (const token of tokens) {
    if (/^<\/fc/iu.test(token)) depth -= 1;
    else depth += 1;
    if (depth < 0) malformed = true;
  }
  if (depth !== 0 || malformed) report.markup.malformedStrings += 1;
}

function newReport(): DataAuditReport {
  return {
    guides: 0,
    steps: 0,
    emptySteps: 0,
    elements: 0,
    elementTypes: {},
    valueKindsByElementType: {},
    nestedValueTypes: {},
    positionKinds: {},
    fontKinds: {},
    stepsWithDifferentVisualOrder: 0,
    markup: { strings: 0, tags: 0, malformedStrings: 0 },
    diagnostics: [],
  };
}

async function guideDirectories(rawDirectory: string): Promise<Array<{ guideId: number; directory: string }>> {
  const root = path.join(rawDirectory, "guides");
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^-?\d+$/u.test(entry.name))
    .map((entry) => ({ guideId: Number(entry.name), directory: path.join(root, entry.name) }))
    .sort((a, b) => a.guideId - b.guideId);
}

export async function auditRawData(rawDirectory: string): Promise<DataAuditReport> {
  const report = newReport();
  const seenElementIds = new Set<number>();
  const guides = await guideDirectories(rawDirectory);
  report.guides = guides.length;

  for (const guide of guides) {
    const stepsDirectory = path.join(guide.directory, "steps");
    const files = (await readdir(stepsDirectory))
      .filter((file) => /^\d+\.json$/u.test(file))
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

    for (const file of files) {
      const stepNumber = Number.parseInt(file, 10);
      const parsed: unknown = JSON.parse(await readFile(path.join(stepsDirectory, file), "utf8"));
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected an array in ${path.join(stepsDirectory, file)}`);
      }
      const elements = parsed as GuideElement[];
      report.steps += 1;
      if (elements.length === 0) report.emptySteps += 1;
      report.elements += elements.length;

      const ordered = orderGuideElementsVisually(elements);
      if (ordered.some((entry) => entry.sourceOrder !== entry.visualOrder)) {
        report.stepsWithDifferentVisualOrder += 1;
      }

      for (const [elementIndex, element] of elements.entries()) {
        increment(report.elementTypes, element.type);
        const kindsForType = report.valueKindsByElementType[element.type] ?? {};
        report.valueKindsByElementType[element.type] = kindsForType;
        increment(kindsForType, valueKind(element.valeur));
        increment(report.fontKinds, valueKind(element.font ?? null));
        inspectMarkup(element.valeur, report);

        if (classifyGuideElementType(element.type) === "UNKNOWN") {
          report.diagnostics.push({ kind: "UNKNOWN_ELEMENT_TYPE", guideId: guide.guideId, stepNumber, elementIndex, detail: element.type });
        }
        if (!Number.isSafeInteger(element.id)) {
          report.diagnostics.push({ kind: "MISSING_ID", guideId: guide.guideId, stepNumber, elementIndex, detail: String(element.id) });
        } else if (seenElementIds.has(element.id)) {
          report.diagnostics.push({ kind: "DUPLICATE_ELEMENT_ID", guideId: guide.guideId, stepNumber, elementIndex, detail: String(element.id) });
        } else {
          seenElementIds.add(element.id);
        }
        if (element.etape !== stepNumber) {
          report.diagnostics.push({ kind: "STEP_MISMATCH", guideId: guide.guideId, stepNumber, elementIndex, detail: String(element.etape) });
        }

        if (isRecord(element.valeur) && typeof element.valeur.type === "string") {
          increment(report.nestedValueTypes, element.valeur.type);
        }
        if (isQuestElement(element.type) && (!isRecord(element.valeur) || typeof element.valeur.name !== "string" || typeof element.valeur.id !== "string")) {
          report.diagnostics.push({ kind: "MALFORMED_QUEST_VALUE", guideId: guide.guideId, stepNumber, elementIndex, detail: valueKind(element.valeur) });
        }

        if (!isRecord(element.pos)) {
          increment(report.positionKinds, valueKind(element.pos ?? null));
        } else {
          const kind = ["pos_x", "pos_y", "hauteur", "largeur"].filter((key) => key in element.pos!).join(",");
          increment(report.positionKinds, kind || "empty-object");
          if (!isCoordinate(element.pos.pos_x) || !isCoordinate(element.pos.pos_y)) {
            report.diagnostics.push({ kind: "INVALID_POSITION", guideId: guide.guideId, stepNumber, elementIndex, detail: JSON.stringify(element.pos) });
          }
        }
      }
    }
  }

  return report;
}

function formatCounts(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name.padEnd(16)} ${count}`);
}

export function formatAuditReport(report: DataAuditReport): string {
  const lines = [
    `Guides: ${report.guides}`,
    `Steps: ${report.steps} (${report.emptySteps} empty)`,
    `Elements: ${report.elements}`,
    "",
    "Types:",
    ...formatCounts(report.elementTypes),
    "",
    "Nested value.type:",
    ...formatCounts(report.nestedValueTypes),
    "",
    `Steps reordered visually: ${report.stepsWithDifferentVisualOrder}`,
    `Dofus markup: ${report.markup.strings} strings, ${report.markup.tags} tags, ${report.markup.malformedStrings} malformed`,
    `Diagnostics: ${report.diagnostics.length}`,
  ];
  for (const diagnostic of report.diagnostics) {
    lines.push(`- ${diagnostic.kind} guide=${diagnostic.guideId} step=${diagnostic.stepNumber} element=${diagnostic.elementIndex}: ${diagnostic.detail}`);
  }
  return lines.join("\n");
}
