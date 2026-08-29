import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { deriveGuideStructure, normalizeGuideStep } from "../normalizer/index.js";
import type { GuideElement, GuideMetadata } from "../types/dofusGuide.js";
import { applyMigrations } from "./migrations.js";
import {
  guideElements,
  guideChapters,
  guides,
  guideStepQuests,
  guideSteps,
  quests,
  schema,
} from "./schema.js";

const GUIDE_DIRECTORY = /^-?\d+$/u;
const STEP_FILE = /^(\d+)\.json$/u;

interface RawStepDocument {
  stepNumber: number;
  rawJson: string;
  elements: GuideElement[];
}

interface RawGuideDocument {
  metadata: GuideMetadata;
  rawMetadataJson: string;
  scrapedAt: string;
  steps: RawStepDocument[];
}

export interface ImportRawOptions {
  rawDirectory?: string;
  databasePath?: string;
  migrationsDirectory?: string;
}

export interface ImportRawResult {
  databasePath: string;
  guidesImported: number;
  stepsImported: number;
  elementsImported: number;
  questsImported: number;
  questOccurrencesImported: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGuideMetadata(value: unknown): value is GuideMetadata {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    typeof value.name === "string"
  );
}

function isGuideElement(value: unknown): value is GuideElement {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.tuto_id === "number" &&
    typeof value.name === "string" &&
    typeof value.etape === "number" &&
    typeof value.type === "string" &&
    "valeur" in value
  );
}

function parseJson(rawJson: string, source: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${source}: ${message}`, { cause: error });
  }
}

function jsonText(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadGuide(
  guideDirectory: string,
  directoryGuideId: number,
): Promise<RawGuideDocument> {
  const metadataPath = path.join(guideDirectory, "metadata.json");
  const rawMetadataJson = (await readFile(metadataPath)).toString("utf8");
  const metadataValue = parseJson(rawMetadataJson, metadataPath);
  if (!isGuideMetadata(metadataValue)) {
    throw new Error(`Invalid guide metadata in ${metadataPath}`);
  }
  if (metadataValue.id !== directoryGuideId) {
    throw new Error(
      `Guide directory ${directoryGuideId} does not match metadata id ${metadataValue.id}`,
    );
  }

  const statePath = path.join(guideDirectory, "scrape-state.json");
  let scrapedAt: string | undefined = typeof metadataValue.updated_at === "string"
    ? metadataValue.updated_at
    : undefined;
  if (scrapedAt === undefined && await pathExists(statePath)) {
    const stateValue = parseJson((await readFile(statePath)).toString("utf8"), statePath);
    if (isRecord(stateValue) && typeof stateValue.updatedAt === "string") {
      scrapedAt = stateValue.updatedAt;
    }
  }
  scrapedAt ??= (await stat(metadataPath)).mtime.toISOString();

  const stepsDirectory = path.join(guideDirectory, "steps");
  const stepEntries = await readdir(stepsDirectory, { withFileTypes: true });
  const stepFiles = stepEntries
    .filter((entry) => entry.isFile() && STEP_FILE.test(entry.name))
    .map((entry) => {
      const match = STEP_FILE.exec(entry.name);
      return { name: entry.name, stepNumber: Number(match?.[1]) };
    })
    .sort((left, right) => left.stepNumber - right.stepNumber);
  const steps: RawStepDocument[] = [];

  for (const stepFile of stepFiles) {
    if (!Number.isSafeInteger(stepFile.stepNumber) || stepFile.stepNumber <= 0) {
      throw new Error(`Invalid step filename: ${stepFile.name}`);
    }
    const stepPath = path.join(stepsDirectory, stepFile.name);
    const rawJson = (await readFile(stepPath)).toString("utf8");
    const value = parseJson(rawJson, stepPath);
    if (!Array.isArray(value) || !value.every(isGuideElement)) {
      throw new Error(`Invalid guide step payload in ${stepPath}`);
    }
    steps.push({ stepNumber: stepFile.stepNumber, rawJson, elements: value });
  }

  return { metadata: metadataValue, rawMetadataJson, scrapedAt, steps };
}

async function loadArchives(rawDirectory: string): Promise<RawGuideDocument[]> {
  const guidesDirectory = path.join(rawDirectory, "guides");
  const entries = await readdir(guidesDirectory, { withFileTypes: true });
  const guideDirectories = entries
    .filter((entry) => entry.isDirectory() && GUIDE_DIRECTORY.test(entry.name))
    .map((entry) => ({ name: entry.name, id: Number(entry.name) }))
    .sort((left, right) => left.id - right.id);

  if (guideDirectories.length === 0) {
    throw new Error(`No archived guides found in ${guidesDirectory}`);
  }

  const documents: RawGuideDocument[] = [];
  for (const guide of guideDirectories) {
    documents.push(await loadGuide(path.join(guidesDirectory, guide.name), guide.id));
  }
  return documents;
}

function importDocuments(
  database: Database.Database,
  documents: RawGuideDocument[],
): Omit<ImportRawResult, "databasePath"> {
  const db = drizzle(database, { schema });
  let stepsImported = 0;
  let elementsImported = 0;
  let questOccurrencesImported = 0;

  db.transaction((transaction) => {
    for (const document of documents) {
      const metadata = document.metadata;
      transaction.insert(guides).values({
        id: metadata.id,
        name: metadata.name,
        author: metadata.autheur ?? null,
        imageUrl: metadata.image ?? null,
        gifUrl: metadata.gif ?? null,
        remoteUpdatedAt: metadata.updated_at ?? null,
        scrapedAt: document.scrapedAt,
        rawJson: document.rawMetadataJson,
      }).run();

      const structure = deriveGuideStructure(document.steps);
      const chapterIds = new Map<number, number>();
      for (const chapter of structure.chapters) {
        const stored = transaction.insert(guideChapters).values({
          guideId: metadata.id,
          chapterNumber: chapter.chapterNumber,
          name: chapter.name,
          rawTitle: chapter.rawTitle,
          recommendedLevelMin: chapter.recommendedLevelMin,
          recommendedLevelMax: chapter.recommendedLevelMax,
          startStep: chapter.startStep,
          endStep: chapter.endStep,
        }).returning({ id: guideChapters.id }).get();
        chapterIds.set(chapter.chapterNumber, stored.id);
      }
      const stepStructure = new Map(structure.steps.map((step) => [step.stepNumber, step]));

      for (const step of document.steps) {
        const normalized = normalizeGuideStep(metadata.id, step.stepNumber, step.elements);
        const derived = stepStructure.get(step.stepNumber);
        transaction.insert(guideSteps).values({
          guideId: metadata.id,
          chapterId: derived?.chapterNumber === null || derived?.chapterNumber === undefined
            ? null
            : chapterIds.get(derived.chapterNumber) ?? null,
          stepNumber: step.stepNumber,
          recommendedLevelMin: derived?.recommendedLevelMin ?? normalized.recommendedLevelMin,
          recommendedLevelMax: derived?.recommendedLevelMax ?? normalized.recommendedLevelMax,
          title: normalized.title,
          rawJson: step.rawJson,
        }).run();
        stepsImported += 1;

        for (const element of normalized.elements) {
          transaction.insert(guideElements).values({
            remoteId: element.remoteId,
            guideId: element.guideId,
            stepNumber: element.stepNumber,
            sortOrder: element.sortOrder,
            elementType: element.elementType,
            positionX: element.positionX,
            positionY: element.positionY,
            width: element.width,
            height: element.height,
            rawValueJson: jsonText(element.rawValue),
            rawElementJson: jsonText(element.rawElement),
          }).run();
          elementsImported += 1;
        }

        for (const occurrence of normalized.quests) {
          const quest = occurrence.quest;
          transaction
            .insert(quests)
            .values({
              questKey: quest.questKey,
              sourceQuestKey: quest.sourceQuestKey,
              originalName: quest.originalName,
              normalizedName: quest.normalizedName,
              sequenceNumber: quest.sequenceNumber,
              externalUrl: quest.externalUrl,
              category: quest.category,
              npcName: quest.npcName,
              npcImageUrl: quest.npcImageUrl,
              startX: quest.startX,
              startY: quest.startY,
              startMap: quest.startMap,
              travelCommand: quest.travelCommand,
              rawValueJson: jsonText(quest.rawValue),
            })
            .onConflictDoUpdate({
              target: quests.questKey,
              set: {
                sourceQuestKey: sql`coalesce(excluded.source_quest_key, ${quests.sourceQuestKey})`,
                originalName: sql`coalesce(excluded.original_name, ${quests.originalName})`,
                normalizedName: sql`coalesce(excluded.normalized_name, ${quests.normalizedName})`,
                sequenceNumber: sql`coalesce(excluded.sequence_number, ${quests.sequenceNumber})`,
                externalUrl: sql`coalesce(excluded.external_url, ${quests.externalUrl})`,
                category: sql`coalesce(excluded.category, ${quests.category})`,
                npcName: sql`coalesce(excluded.npc_name, ${quests.npcName})`,
                npcImageUrl: sql`coalesce(excluded.npc_image_url, ${quests.npcImageUrl})`,
                startX: sql`coalesce(excluded.start_x, ${quests.startX})`,
                startY: sql`coalesce(excluded.start_y, ${quests.startY})`,
                startMap: sql`coalesce(excluded.start_map, ${quests.startMap})`,
                travelCommand: sql`coalesce(excluded.travel_command, ${quests.travelCommand})`,
                rawValueJson: jsonText(quest.rawValue),
              },
            })
            .run();

          const storedQuest = transaction
            .select({ id: quests.id })
            .from(quests)
            .where(eq(quests.questKey, quest.questKey))
            .get();
          if (storedQuest === undefined) {
            throw new Error(`Unable to resolve imported quest ${quest.questKey}`);
          }
          transaction.insert(guideStepQuests).values({
            guideId: metadata.id,
            stepNumber: step.stepNumber,
            questId: storedQuest.id,
            relationType: occurrence.relationType,
            sortOrder: occurrence.sortOrder,
          }).run();
          questOccurrencesImported += 1;
        }
      }
    }
  });

  const questCount = db
    .select({ count: sql<number>`count(*)` })
    .from(quests)
    .get()?.count;

  return {
    guidesImported: documents.length,
    stepsImported,
    elementsImported,
    questsImported: Number(questCount ?? 0),
    questOccurrencesImported,
  };
}

async function replaceDatabase(temporaryPath: string, databasePath: string): Promise<void> {
  const backupPath = `${databasePath}.${process.pid}.${randomUUID()}.backup`;
  const hadExistingDatabase = await pathExists(databasePath);

  if (hadExistingDatabase) {
    await rename(databasePath, backupPath);
  }
  try {
    await rename(temporaryPath, databasePath);
  } catch (error) {
    if (hadExistingDatabase) {
      await rename(backupPath, databasePath).catch(() => undefined);
    }
    throw error;
  }
  if (hadExistingDatabase) {
    await rm(backupPath, { force: true });
  }
}

function databasesAreEquivalent(existingPath: string, candidatePath: string): boolean {
  let existing: Database.Database | undefined;
  let candidate: Database.Database | undefined;
  try {
    existing = new Database(existingPath, { readonly: true });
    candidate = new Database(candidatePath, { readonly: true });
    const schemaQuery = `
      SELECT type, name, sql
      FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `;
    const existingSchema = existing.prepare(schemaQuery).all();
    const candidateSchema = candidate.prepare(schemaQuery).all();
    if (JSON.stringify(existingSchema) !== JSON.stringify(candidateSchema)) return false;

    const tableNames = (existingSchema as Array<{ type: string; name: string }>)
      .filter((entry) => entry.type === "table")
      .map((entry) => entry.name);
    for (const tableName of tableNames) {
      const quotedName = '"' + tableName.replaceAll('"', '""') + '"';
      const selection = tableName === "schema_migrations" ? "name" : "*";
      const existingRows = existing.prepare("SELECT " + selection + " FROM " + quotedName + " ORDER BY rowid").all();
      const candidateRows = candidate.prepare("SELECT " + selection + " FROM " + quotedName + " ORDER BY rowid").all();
      if (JSON.stringify(existingRows) !== JSON.stringify(candidateRows)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    existing?.close();
    candidate?.close();
  }
}

export async function importRawDatabase(
  options: ImportRawOptions = {},
): Promise<ImportRawResult> {
  const rawDirectory = path.resolve(options.rawDirectory ?? "data/raw");
  const databasePath = path.resolve(options.databasePath ?? "data/dofusguide.sqlite");
  const migrationsDirectory = path.resolve(options.migrationsDirectory ?? "drizzle");
  const documents = await loadArchives(rawDirectory);

  await mkdir(path.dirname(databasePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(databasePath),
    `.${path.basename(databasePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let database: Database.Database | undefined;

  try {
    database = new Database(temporaryPath);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = DELETE");
    database.pragma("synchronous = FULL");
    applyMigrations(database, migrationsDirectory);
    const result = importDocuments(database, documents);
    database.close();
    database = undefined;
    if (await pathExists(databasePath) && databasesAreEquivalent(databasePath, temporaryPath)) {
      await rm(temporaryPath, { force: true });
    } else {
      await replaceDatabase(temporaryPath, databasePath);
    }
    return { databasePath, ...result };
  } catch (error) {
    if (database?.open === true) {
      database.close();
    }
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await rm(`${temporaryPath}-journal`, { force: true }).catch(() => undefined);
    await rm(`${temporaryPath}-shm`, { force: true }).catch(() => undefined);
    await rm(`${temporaryPath}-wal`, { force: true }).catch(() => undefined);
    throw error;
  }
}
