import { readFile } from "node:fs/promises";
import path from "node:path";
import { DofusGuideClient } from "../api/dofusGuideClient.js";
import type {
  GuideElement,
  GuideMetadata,
  RawJsonDocument,
} from "../types/dofusGuide.js";
import { atomicWriteFile } from "../utils/fs.js";
import { sleep as defaultSleep, type Sleep } from "../utils/sleep.js";
import { saveStep, type StepSaveStatus } from "./changeTracking.js";
import { selectGuide, type GuideSelection } from "./selectGuide.js";
import {
  readScrapeState,
  SCRAPE_STATE_VERSION,
  writeScrapeState,
  type ScrapeState,
} from "./scrapeState.js";

const KNOWN_ELEMENT_TYPES = new Set([
  "IMAGE",
  "TEXTE",
  "QUEST_START",
  "QUEST",
  "QUEST_FINISH",
  "ITEMS",
  "HTML",
  "DUNGEON",
  "TRAVEL",
  "MONSTER",
  "CAC",
  "LIEN",
]);

export interface GuideStepSource {
  getGuidesDocument(): Promise<RawJsonDocument<GuideMetadata[]>>;
  getGuideStepDocument(
    guideId: number,
    step: number,
  ): Promise<RawJsonDocument<GuideElement[]>>;
}

export interface ScrapeGuideStepOptions {
  guideId: number;
  step: number;
  force?: boolean;
  refresh?: boolean;
  client?: GuideStepSource;
  rawRoot?: string;
  logger?: Pick<Console, "info" | "warn">;
  now?: () => Date;
}

export interface ScrapeGuideOptions extends GuideSelection {
  startStep?: number;
  stopAfterEmpty?: number;
  delayMs?: number;
  resume?: boolean;
  force?: boolean;
  refresh?: boolean;
  client?: GuideStepSource;
  rawRoot?: string;
  logger?: Pick<Console, "info" | "warn">;
  sleep?: Sleep;
  now?: () => Date;
}

export interface ScrapeGuideStepResult {
  guide: GuideMetadata;
  elements: GuideElement[];
  outputFile: string;
}

export interface ScrapeGuideResult {
  guide: GuideMetadata;
  stepsDownloaded: number;
  stepsSkipped: number;
  emptyStepsEncountered: number;
  elementsDownloaded: number;
  lastProcessedStep: number;
  outputDirectory: string;
}

export function formatStepNumber(step: number): string {
  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError("step must be a positive integer");
  }
  return String(step).padStart(4, "0");
}

function isGuideMetadata(value: unknown): value is GuideMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function isStoredGuideElement(value: unknown): value is GuideElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "tuto_id" in value &&
    typeof value.tuto_id === "number" &&
    "name" in value &&
    typeof value.name === "string" &&
    "etape" in value &&
    typeof value.etape === "number" &&
    "type" in value &&
    typeof value.type === "string" &&
    "valeur" in value
  );
}

function warnUnknownTypes(elements: GuideElement[], logger: Pick<Console, "warn">): void {
  const unknownTypes = new Set<string>();
  for (const element of elements) {
    if (!KNOWN_ELEMENT_TYPES.has(element.type) && !unknownTypes.has(element.type)) {
      unknownTypes.add(element.type);
      logger.warn(`Unknown guide element type: ${element.type}`);
    }
  }
}

async function readOptionalFile(filePath: string): Promise<Buffer | undefined> {
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

async function readLocalGuides(
  rawRoot: string,
): Promise<RawJsonDocument<GuideMetadata[]> | undefined> {
  const filePath = path.join(rawRoot, "guides.json");
  const body = await readOptionalFile(filePath);
  if (body === undefined) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new Error(`Local guide list contains invalid JSON: ${filePath}`, { cause: error });
  }
  if (!Array.isArray(value) || !value.every(isGuideMetadata)) {
    throw new Error(`Local guide list contains an unexpected payload: ${filePath}`);
  }
  return { body, data: value };
}

async function readExistingStep(filePath: string): Promise<GuideElement[] | undefined> {
  const body = await readOptionalFile(filePath);
  if (body === undefined) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new Error(`Existing step file contains invalid JSON: ${filePath}`, { cause: error });
  }
  if (!Array.isArray(value) || !value.every(isStoredGuideElement)) {
    throw new Error(`Existing step file contains an unexpected payload: ${filePath}`);
  }
  return value;
}

async function prepareGuide(
  client: GuideStepSource,
  rawRoot: string,
  selection: GuideSelection,
  logger: Pick<Console, "info" | "warn">,
  preferLocal: boolean,
): Promise<GuideMetadata> {
  let guidesDocument = preferLocal ? await readLocalGuides(rawRoot) : undefined;
  if (guidesDocument === undefined) {
    guidesDocument = await client.getGuidesDocument();
    await atomicWriteFile(path.join(rawRoot, "guides.json"), guidesDocument.body);
  }

  const guide = selectGuide(guidesDocument.data, { ...selection, logger });
  const guideRoot = path.join(rawRoot, "guides", String(guide.id));
  const metadata = Buffer.from(`${JSON.stringify(guide, null, 2)}\n`, "utf8");
  await atomicWriteFile(path.join(guideRoot, "metadata.json"), metadata);
  logger.info(`[guide] ${guide.name}, id=${guide.id}`);
  return guide;
}

function logStepSave(
  logger: Pick<Console, "info">,
  stepLabel: string,
  status: StepSaveStatus,
  elementCount: number,
): void {
  if (elementCount === 0) {
    logger.info(`[step ${stepLabel}] ${status === "changed" ? "changed, empty" : status}`);
    return;
  }
  logger.info(`[step ${stepLabel}] ${status}, ${elementCount} elements`);
}

function printSummary(
  logger: Pick<Console, "info">,
  result: ScrapeGuideResult,
): void {
  logger.info("Scraping complete");
  logger.info(`Guide: ${result.guide.name}`);
  logger.info(`ID: ${result.guide.id}`);
  logger.info(`Steps downloaded: ${result.stepsDownloaded}`);
  logger.info(`Steps skipped: ${result.stepsSkipped}`);
  logger.info(`Empty steps encountered: ${result.emptyStepsEncountered}`);
  logger.info(`Elements downloaded: ${result.elementsDownloaded}`);
  logger.info(`Output: ${result.outputDirectory}`);
}

export async function scrapeGuideStep(
  options: ScrapeGuideStepOptions,
): Promise<ScrapeGuideStepResult> {
  const client = options.client ?? new DofusGuideClient();
  const rawRoot = options.rawRoot ?? path.resolve("data", "raw");
  const logger = options.logger ?? console;
  const now = options.now ?? (() => new Date());

  if (!Number.isInteger(options.guideId)) {
    throw new RangeError("guideId must be an integer");
  }
  if (options.force === true && options.refresh === true) {
    throw new Error("--force and --refresh cannot be used together");
  }

  const guide = await prepareGuide(
    client,
    rawRoot,
    { guideId: options.guideId },
    logger,
    false,
  );
  const guideRoot = path.join(rawRoot, "guides", String(guide.id));
  const stepLabel = formatStepNumber(options.step);
  const outputFile = path.join(guideRoot, "steps", `${stepLabel}.json`);

  if (options.force !== true && options.refresh !== true) {
    const existing = await readExistingStep(outputFile);
    if (existing !== undefined) {
      warnUnknownTypes(existing, logger);
      logger.info(`[step ${stepLabel}] skipped, ${existing.length} elements`);
      logger.info(`[step ${stepLabel}] output: ${outputFile}`);
      return { guide, elements: existing, outputFile };
    }
  }

  const stepDocument = await client.getGuideStepDocument(guide.id, options.step);
  warnUnknownTypes(stepDocument.data, logger);
  const status = await saveStep({
    filePath: outputFile,
    guideRoot,
    step: options.step,
    body: stepDocument.body,
    trackExistingChanges: options.force === true || options.refresh === true,
    detectedAt: now().toISOString(),
  });
  logStepSave(logger, stepLabel, status, stepDocument.data.length);
  logger.info(`[step ${stepLabel}] output: ${outputFile}`);
  return { guide, elements: stepDocument.data, outputFile };
}

export async function scrapeGuide(options: ScrapeGuideOptions = {}): Promise<ScrapeGuideResult> {
  const client = options.client ?? new DofusGuideClient();
  const rawRoot = options.rawRoot ?? path.resolve("data", "raw");
  const logger = options.logger ?? console;
  const wait = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const selectedModes = [options.resume, options.force, options.refresh].filter(
    (enabled) => enabled === true,
  ).length;

  if (selectedModes > 1) {
    throw new Error("--resume, --force and --refresh are mutually exclusive");
  }
  if (options.resume === true && options.startStep !== undefined) {
    throw new Error("--start-step cannot be combined with --resume");
  }
  if (options.guideId !== undefined && options.guideName !== undefined) {
    throw new Error("--guide and --guide-name cannot be used together");
  }

  const selection: GuideSelection = {
    ...(options.guideId === undefined ? {} : { guideId: options.guideId }),
    ...(options.guideName === undefined ? {} : { guideName: options.guideName }),
    ...(options.fallbackGuideId === undefined
      ? {}
      : { fallbackGuideId: options.fallbackGuideId }),
  };
  const guide = await prepareGuide(client, rawRoot, selection, logger, options.resume === true);
  const outputDirectory = path.join(rawRoot, "guides", String(guide.id));
  const previousState = options.resume === true ? await readScrapeState(outputDirectory) : undefined;

  if (options.resume === true && previousState === undefined) {
    throw new Error(`Cannot resume: scrape-state.json is missing for guide id=${guide.id}`);
  }
  if (previousState !== undefined && previousState.guideId !== guide.id) {
    throw new Error(
      `Cannot resume guide id=${guide.id} from state for guide id=${previousState.guideId}`,
    );
  }

  const stopAfterEmpty =
    options.stopAfterEmpty ?? previousState?.stopAfterEmpty ?? 5;
  const delayMs = options.delayMs ?? previousState?.delayMs ?? 350;
  const startStep =
    previousState === undefined ? options.startStep ?? 1 : previousState.lastProcessedStep + 1;
  formatStepNumber(startStep);
  if (!Number.isInteger(stopAfterEmpty) || stopAfterEmpty < 1) {
    throw new RangeError("stopAfterEmpty must be a positive integer");
  }
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new RangeError("delayMs must be a non-negative integer");
  }

  if (previousState?.status === "completed") {
    logger.info(
      `[resume] scraping already completed at step ${previousState.lastProcessedStep}`,
    );
    const completedResult: ScrapeGuideResult = {
      guide,
      stepsDownloaded: 0,
      stepsSkipped: 0,
      emptyStepsEncountered: 0,
      elementsDownloaded: 0,
      lastProcessedStep: previousState.lastProcessedStep,
      outputDirectory,
    };
    printSummary(logger, completedResult);
    return completedResult;
  }

  let consecutiveEmptySteps = previousState?.consecutiveEmptySteps ?? 0;
  let lastNonEmptyStep = previousState?.lastNonEmptyStep ?? null;
  let lastProcessedStep = previousState?.lastProcessedStep ?? startStep - 1;
  let emptyStepsEncountered = 0;
  let stepsDownloaded = 0;
  let stepsSkipped = 0;
  let elementsDownloaded = 0;
  let hasRequestedStep = false;

  const createState = (status: ScrapeState["status"]): ScrapeState => ({
    version: SCRAPE_STATE_VERSION,
    guideId: guide.id,
    guideName: guide.name,
    lastProcessedStep,
    lastSuccessfulStep: lastProcessedStep,
    lastNonEmptyStep,
    consecutiveEmptySteps,
    stopAfterEmpty,
    delayMs,
    status,
    updatedAt: now().toISOString(),
  });
  await writeScrapeState(outputDirectory, createState("running"));

  for (let step = startStep; consecutiveEmptySteps < stopAfterEmpty; step += 1) {
    const stepLabel = formatStepNumber(step);
    const outputFile = path.join(outputDirectory, "steps", `${stepLabel}.json`);
    let elements =
      options.force === true || options.refresh === true
        ? undefined
        : await readExistingStep(outputFile);

    if (elements === undefined) {
      if (hasRequestedStep && delayMs > 0) {
        await wait(delayMs);
      }
      const document = await client.getGuideStepDocument(guide.id, step);
      elements = document.data;
      warnUnknownTypes(elements, logger);
      const status = await saveStep({
        filePath: outputFile,
        guideRoot: outputDirectory,
        step,
        body: document.body,
        trackExistingChanges: options.force === true || options.refresh === true,
        detectedAt: now().toISOString(),
      });
      stepsDownloaded += 1;
      elementsDownloaded += elements.length;
      hasRequestedStep = true;
      logStepSave(logger, stepLabel, status, elements.length);
    } else {
      warnUnknownTypes(elements, logger);
      stepsSkipped += 1;
      logger.info(
        elements.length === 0
          ? `[step ${stepLabel}] skipped, empty`
          : `[step ${stepLabel}] skipped, ${elements.length} elements`,
      );
    }

    lastProcessedStep = step;
    if (elements.length === 0) {
      consecutiveEmptySteps += 1;
      emptyStepsEncountered += 1;
    } else {
      consecutiveEmptySteps = 0;
      lastNonEmptyStep = step;
    }
    await writeScrapeState(outputDirectory, createState("running"));
  }

  await writeScrapeState(outputDirectory, createState("completed"));
  const result: ScrapeGuideResult = {
    guide,
    stepsDownloaded,
    stepsSkipped,
    emptyStepsEncountered,
    elementsDownloaded,
    lastProcessedStep,
    outputDirectory,
  };
  printSummary(logger, result);
  return result;
}
