import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";

export interface StepChange {
  step: number;
  previousHash: string;
  newHash: string;
  archivedPath: string;
  detectedAt: string;
}

export type StepSaveStatus = "saved" | "unchanged" | "changed";

export interface SaveStepOptions {
  filePath: string;
  guideRoot: string;
  step: number;
  body: Buffer;
  trackExistingChanges: boolean;
  detectedAt: string;
}

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function safeTimestamp(isoTimestamp: string): string {
  return isoTimestamp.replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

async function readExisting(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function appendChange(guideRoot: string, change: StepChange): Promise<void> {
  const journalPath = path.join(guideRoot, "changes.jsonl");
  const existing = (await readExisting(journalPath)) ?? Buffer.alloc(0);
  const line = Buffer.from(`${JSON.stringify(change)}\n`, "utf8");
  await atomicWriteFile(journalPath, Buffer.concat([existing, line]));
}

export async function saveStep(options: SaveStepOptions): Promise<StepSaveStatus> {
  const previousBody = await readExisting(options.filePath);
  if (previousBody === undefined) {
    await atomicWriteFile(options.filePath, options.body);
    return "saved";
  }
  if (!options.trackExistingChanges) {
    return "unchanged";
  }

  const previousHash = sha256(previousBody);
  const newHash = sha256(options.body);
  if (previousHash === newHash) {
    return "unchanged";
  }

  const stepLabel = String(options.step).padStart(4, "0");
  const archiveName = `${safeTimestamp(options.detectedAt)}-${newHash.slice(0, 12)}.json`;
  const archivePath = path.join(
    options.guideRoot,
    "changes",
    "steps",
    stepLabel,
    archiveName,
  );
  await atomicWriteFile(archivePath, previousBody);
  await atomicWriteFile(options.filePath, options.body);

  const archivedPath = path.relative(options.guideRoot, archivePath).split(path.sep).join("/");
  await appendChange(options.guideRoot, {
    step: options.step,
    previousHash,
    newHash,
    archivedPath,
    detectedAt: options.detectedAt,
  });
  return "changed";
}
