import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";

export const SCRAPE_STATE_VERSION = 1;

export interface ScrapeState {
  version: typeof SCRAPE_STATE_VERSION;
  guideId: number;
  guideName: string;
  lastProcessedStep: number;
  lastSuccessfulStep: number;
  lastNonEmptyStep: number | null;
  consecutiveEmptySteps: number;
  stopAfterEmpty: number;
  delayMs: number;
  status: "running" | "completed";
  updatedAt: string;
}

export function scrapeStatePath(guideRoot: string): string {
  return path.join(guideRoot, "scrape-state.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScrapeState(value: unknown): value is ScrapeState {
  return (
    isRecord(value) &&
    value.version === SCRAPE_STATE_VERSION &&
    typeof value.guideId === "number" &&
    typeof value.guideName === "string" &&
    typeof value.lastProcessedStep === "number" &&
    typeof value.lastSuccessfulStep === "number" &&
    (typeof value.lastNonEmptyStep === "number" || value.lastNonEmptyStep === null) &&
    typeof value.consecutiveEmptySteps === "number" &&
    typeof value.stopAfterEmpty === "number" &&
    typeof value.delayMs === "number" &&
    (value.status === "running" || value.status === "completed") &&
    typeof value.updatedAt === "string"
  );
}

export async function readScrapeState(guideRoot: string): Promise<ScrapeState | undefined> {
  const filePath = scrapeStatePath(guideRoot);
  let body: string;
  try {
    body = await readFile(filePath, "utf8");
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

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    throw new Error(`Scrape state contains invalid JSON: ${filePath}`, { cause: error });
  }
  if (!isScrapeState(value)) {
    throw new Error(`Scrape state has an unsupported shape: ${filePath}`);
  }
  return value;
}

export async function writeScrapeState(
  guideRoot: string,
  state: ScrapeState,
): Promise<void> {
  await atomicWriteFile(
    scrapeStatePath(guideRoot),
    Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8"),
  );
}
