import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { normalizeName } from "../normalizer/index.js";
import { guideChapters, guideElements, guides, guideStepQuests, guideSteps, quests, schema } from "../db/schema.js";
import type {
  DofusGuideRepository,
  GuideChapterRecord,
  GuideElementRecord,
  GuideRecord,
  GuideQuestOccurrenceRecord,
  GuideStepRecord,
  GuideStepSummaryRecord,
  PaginatedQuests,
  QuestRecord,
  QuestStepRecord,
  SearchQuestOptions,
  StepQuestRecord,
} from "./contracts.js";

function parseStoredJson(rawJson: string, label: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Invalid JSON stored for ${label}`, { cause: error });
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

const guideSelection = {
  id: guides.id,
  name: guides.name,
  author: guides.author,
  imageUrl: guides.imageUrl,
  gifUrl: guides.gifUrl,
  remoteUpdatedAt: guides.remoteUpdatedAt,
  scrapedAt: guides.scrapedAt,
  rawJson: guides.rawJson,
};

const questSelection = {
  id: quests.id,
  questKey: quests.questKey,
  sourceQuestKey: quests.sourceQuestKey,
  originalName: quests.originalName,
  normalizedName: quests.normalizedName,
  sequenceNumber: quests.sequenceNumber,
  externalUrl: quests.externalUrl,
  category: quests.category,
  npcName: quests.npcName,
  npcImageUrl: quests.npcImageUrl,
  startX: quests.startX,
  startY: quests.startY,
  startMap: quests.startMap,
  travelCommand: quests.travelCommand,
  rawValueJson: quests.rawValueJson,
};

function mapGuide(row: typeof guides.$inferSelect): GuideRecord {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    imageUrl: row.imageUrl,
    gifUrl: row.gifUrl,
    remoteUpdatedAt: row.remoteUpdatedAt,
    scrapedAt: row.scrapedAt,
    raw: parseStoredJson(row.rawJson, `guide ${row.id}`),
  };
}

function mapQuest(row: typeof quests.$inferSelect): QuestRecord {
  return {
    id: row.id,
    questKey: row.questKey,
    sourceQuestKey: row.sourceQuestKey,
    originalName: row.originalName,
    normalizedName: row.normalizedName,
    sequenceNumber: row.sequenceNumber,
    externalUrl: row.externalUrl,
    category: row.category,
    npcName: row.npcName,
    npcImageUrl: row.npcImageUrl,
    startX: row.startX,
    startY: row.startY,
    startMap: row.startMap,
    travelCommand: row.travelCommand,
    rawValue: parseStoredJson(row.rawValueJson, `quest ${row.questKey}`),
  };
}

export class SqliteDofusGuideRepository implements DofusGuideRepository {
  readonly databasePath: string;
  private readonly sqlite: Database.Database;
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(databasePath = "data/dofusguide.sqlite") {
    this.databasePath = path.resolve(databasePath);
    if (!existsSync(this.databasePath)) throw new Error(`Database not found: ${this.databasePath}`);
    try {
      this.sqlite = new Database(this.databasePath, { readonly: true, fileMustExist: true });
      this.sqlite.pragma("foreign_keys = ON");
      this.db = drizzle(this.sqlite, { schema });
    } catch (error) {
      throw new Error(`Unable to open database: ${this.databasePath}`, { cause: error });
    }
  }

  close(): void {
    if (this.sqlite.open) this.sqlite.close();
  }

  listGuides(): GuideRecord[] {
    return this.db.select(guideSelection).from(guides).orderBy(asc(guides.id)).all().map(mapGuide);
  }

  getGuide(id: number): GuideRecord | undefined {
    const row = this.db.select(guideSelection).from(guides).where(eq(guides.id, id)).get();
    return row === undefined ? undefined : mapGuide(row);
  }

  listGuideChapters(guideId: number): GuideChapterRecord[] {
    return this.db.select().from(guideChapters).where(eq(guideChapters.guideId, guideId)).orderBy(asc(guideChapters.chapterNumber)).all();
  }

  listGuideSteps(guideId: number): GuideStepSummaryRecord[] {
    return this.db.select({
      id: guideSteps.id,
      guideId: guideSteps.guideId,
      chapterId: guideSteps.chapterId,
      stepNumber: guideSteps.stepNumber,
      recommendedLevelMin: guideSteps.recommendedLevelMin,
      recommendedLevelMax: guideSteps.recommendedLevelMax,
      title: guideSteps.title,
    }).from(guideSteps).where(eq(guideSteps.guideId, guideId)).orderBy(asc(guideSteps.stepNumber)).all();
  }

  getGuideStep(guideId: number, stepNumber: number): GuideStepRecord | undefined {
    const step = this.db.select({
      id: guideSteps.id,
      guideId: guideSteps.guideId,
      stepNumber: guideSteps.stepNumber,
      recommendedLevelMin: guideSteps.recommendedLevelMin,
      recommendedLevelMax: guideSteps.recommendedLevelMax,
      title: guideSteps.title,
      rawJson: guideSteps.rawJson,
    }).from(guideSteps).where(and(eq(guideSteps.guideId, guideId), eq(guideSteps.stepNumber, stepNumber))).get();
    if (step === undefined) return undefined;

    const elements: GuideElementRecord[] = this.db.select({
      id: guideElements.id,
      remoteId: guideElements.remoteId,
      sortOrder: guideElements.sortOrder,
      elementType: guideElements.elementType,
      positionX: guideElements.positionX,
      positionY: guideElements.positionY,
      width: guideElements.width,
      height: guideElements.height,
      rawValueJson: guideElements.rawValueJson,
      rawElementJson: guideElements.rawElementJson,
    }).from(guideElements).where(and(eq(guideElements.guideId, guideId), eq(guideElements.stepNumber, stepNumber))).orderBy(asc(guideElements.sortOrder), asc(guideElements.id)).all().map((row) => ({
      id: row.id,
      remoteId: row.remoteId,
      sortOrder: row.sortOrder,
      elementType: row.elementType,
      positionX: row.positionX,
      positionY: row.positionY,
      width: row.width,
      height: row.height,
      rawValue: parseStoredJson(row.rawValueJson, `element ${row.id} value`),
      rawElement: parseStoredJson(row.rawElementJson, `element ${row.id}`),
    }));

    const stepQuests: StepQuestRecord[] = this.db.select({
      ...questSelection,
      relationType: guideStepQuests.relationType,
      sortOrder: guideStepQuests.sortOrder,
    }).from(guideStepQuests).innerJoin(quests, eq(quests.id, guideStepQuests.questId)).where(and(eq(guideStepQuests.guideId, guideId), eq(guideStepQuests.stepNumber, stepNumber))).orderBy(asc(guideStepQuests.sortOrder), asc(guideStepQuests.id)).all().map((row) => {
      const { relationType, sortOrder, ...quest } = row;
      return { ...mapQuest(quest), relationType, sortOrder };
    });

    return {
      id: step.id,
      guideId: step.guideId,
      stepNumber: step.stepNumber,
      recommendedLevelMin: step.recommendedLevelMin,
      recommendedLevelMax: step.recommendedLevelMax,
      title: step.title,
      raw: parseStoredJson(step.rawJson, `guide step ${guideId}:${stepNumber}`),
      elements,
      quests: stepQuests,
    };
  }

  searchQuests(options: SearchQuestOptions = {}): PaginatedQuests {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const filters: SQL[] = [];
    if (options.q !== undefined) {
      const q = normalizeName(options.q);
      if (q !== "") filters.push(sql`${quests.normalizedName} LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'`);
    }
    if (options.type !== undefined) filters.push(sql`lower(${quests.category}) = lower(${options.type})`);

    const scopeFilters: SQL[] = [];
    if (options.guideId !== undefined) scopeFilters.push(eq(guideStepQuests.guideId, options.guideId));
    if (options.stepMin !== undefined) scopeFilters.push(sql`${guideStepQuests.stepNumber} >= ${options.stepMin}`);
    if (options.stepMax !== undefined) scopeFilters.push(sql`${guideStepQuests.stepNumber} <= ${options.stepMax}`);
    if (scopeFilters.length > 0) {
      const scopedQuestIds = this.db.select({ questId: guideStepQuests.questId }).from(guideStepQuests).where(and(...scopeFilters));
      filters.push(inArray(quests.id, scopedQuestIds));
    }
    const where = filters.length === 0 ? undefined : and(...filters);
    const total = this.db.select({ count: count() }).from(quests).where(where).get()?.count ?? 0;
    const rows = this.db.select(questSelection).from(quests).where(where).orderBy(sql`${quests.normalizedName} IS NULL`, asc(quests.normalizedName), asc(quests.questKey)).limit(limit).offset(offset).all();
    return { items: rows.map(mapQuest), total: Number(total), limit, offset };
  }

  getQuest(questKey: string): QuestRecord | undefined {
    const row = this.db.select(questSelection).from(quests).where(eq(quests.questKey, questKey)).get();
    return row === undefined ? undefined : mapQuest(row);
  }

  getQuestSteps(questKey: string): QuestStepRecord[] | undefined {
    if (this.getQuest(questKey) === undefined) return undefined;
    return this.db.select({
      guideId: guideStepQuests.guideId,
      guideName: guides.name,
      stepNumber: guideStepQuests.stepNumber,
      stepTitle: guideSteps.title,
      relationType: guideStepQuests.relationType,
      sortOrder: guideStepQuests.sortOrder,
    }).from(guideStepQuests)
      .innerJoin(quests, eq(quests.id, guideStepQuests.questId))
      .innerJoin(guides, eq(guides.id, guideStepQuests.guideId))
      .innerJoin(guideSteps, and(eq(guideSteps.guideId, guideStepQuests.guideId), eq(guideSteps.stepNumber, guideStepQuests.stepNumber)))
      .where(eq(quests.questKey, questKey))
      .orderBy(asc(guideStepQuests.guideId), asc(guideStepQuests.stepNumber), asc(guideStepQuests.sortOrder), asc(guideStepQuests.id)).all();
  }

  listGuideQuestOccurrences(guideId: number): GuideQuestOccurrenceRecord[] {
    return this.db.select({
      questKey: quests.questKey,
      stepNumber: guideStepQuests.stepNumber,
      relationType: guideStepQuests.relationType,
      rawValueJson: quests.rawValueJson,
    }).from(guideStepQuests)
      .innerJoin(quests, eq(quests.id, guideStepQuests.questId))
      .where(eq(guideStepQuests.guideId, guideId))
      .orderBy(asc(guideStepQuests.stepNumber), asc(guideStepQuests.sortOrder), asc(guideStepQuests.id))
      .all()
      .map((row) => ({
        questKey: row.questKey,
        stepNumber: row.stepNumber,
        relationType: row.relationType,
        rawValue: parseStoredJson(row.rawValueJson, "tagged quest " + row.questKey),
      }));
  }
}
