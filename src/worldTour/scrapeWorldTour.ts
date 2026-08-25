import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeName } from "../normalizer/names.js";
import { atomicWriteFile } from "../utils/fs.js";
import { retry } from "../utils/retry.js";
import { sleep } from "../utils/sleep.js";
import {
  dofusDbAchievementSchema,
  dofusDbDungeonSchema,
  dofusDbMonsterSchema,
  dofusDbQuestSchema,
  type DofusDbAchievement,
  type DofusDbDungeon,
  type DofusDbMonster,
  type DofusDbQuest,
  type WorldTourArchive,
  type WorldTourDungeon,
  type WorldTourTrack,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.dofusdb.fr";
const USER_AGENT = "DofusGuideScraper/0.1.0 (local DofusDB world tour archival client)";

const TRACKS = [
  { id: "metag-robill" as const, name: "Metag Robill", achievementIds: [559], expected: 27 },
  { id: "emma-tompouce" as const, name: "Emma Tompouce", achievementIds: [560, 561, 562, 563, 564], expected: 29 },
];

const DUNGEON_GUIDE_URL_OVERRIDES = new Map<number, string>([
  [31, "https://www.dofuspourlesnoobs.com/antre-du-kralamoure-geacuteant.html#sorts-expedition"],
]);

class HttpStatusError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super("GET " + url + " returned HTTP " + status);
  }
}

async function request(url: string): Promise<Response> {
  return retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json,image/*", "user-agent": USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) throw new HttpStatusError(response.status, url);
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    maxRetries: 3,
    shouldRetry: (error) => !(error instanceof HttpStatusError) || error.status === 408 || error.status === 429 || error.status >= 500,
  });
}

async function requestJson<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  const response = await request(url);
  return parse(await response.json());
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface GuideDungeonReference {
  name: string;
  step: number;
  link: string | null;
}

async function loadGuideDungeons(stepsDirectory: string): Promise<GuideDungeonReference[]> {
  const files = (await readdir(stepsDirectory)).filter((file) => /^\d+\.json$/.test(file)).sort();
  const references: GuideDungeonReference[] = [];
  for (const file of files) {
    const elements = JSON.parse(await readFile(path.join(stepsDirectory, file), "utf8")) as unknown;
    if (!Array.isArray(elements)) continue;
    for (const element of elements) {
      if (typeof element !== "object" || element === null) continue;
      const record = element as Record<string, unknown>;
      if (record.type !== "DUNGEON" || typeof record.valeur !== "object" || record.valeur === null || Array.isArray(record.valeur)) continue;
      const value = record.valeur as Record<string, unknown>;
      if (typeof value.name !== "string" || typeof record.etape !== "number") continue;
      references.push({
        name: value.name,
        step: record.etape,
        link: typeof value.lien === "string" ? value.lien : null,
      });
    }
  }
  return references;
}

function questIds(achievement: DofusDbAchievement): number[] {
  return [...achievement.objectives]
    .sort((left, right) => left.order - right.order)
    .flatMap((objective) => {
      const match = /Qf=(\d+)/.exec(objective.criterion);
      return match?.[1] ? [Number(match[1])] : [];
    });
}

function orderedQuestSteps(quest: DofusDbQuest) {
  const byId = new Map(quest.steps.map((step) => [step.id, step]));
  const ordered = quest.stepIds.flatMap((id) => {
    const step = byId.get(id);
    return step ? [step] : [];
  });
  const known = new Set(ordered.map((step) => step.id));
  return [...ordered, ...quest.steps.filter((step) => !known.has(step.id))];
}

function guideReferenceFor(dungeon: DofusDbDungeon, references: GuideDungeonReference[]): GuideDungeonReference | null {
  const normalized = normalizeName(dungeon.name.fr ?? "");
  return references.find((reference) => normalizeName(reference.name) === normalized) ?? null;
}

function anchoredGuideUrl(link: string | null): string | null {
  if (!link) return null;
  const url = new URL(link);
  url.hash = "sorts-expedition";
  return url.toString();
}

export interface ScrapeWorldTourOptions {
  baseUrl?: string;
  outputPath?: string;
  publicImageDirectory?: string;
  guideStepsDirectory?: string;
  requestDelayMs?: number;
  imageDelayMs?: number;
  metadataOnly?: boolean;
  force?: boolean;
}

export async function scrapeWorldTour(options: ScrapeWorldTourOptions = {}): Promise<WorldTourArchive> {
  const baseUrl = options.baseUrl ?? process.env.DOFUSDB_API_BASE_URL ?? DEFAULT_BASE_URL;
  const outputPath = options.outputPath ?? "data/dofusdb/world-tour.json";
  const imageDirectory = options.publicImageDirectory ?? "public/world-tour/monsters";
  const guideStepsDirectory = options.guideStepsDirectory ?? "data/raw/guides/-1/steps";
  const requestDelayMs = options.requestDelayMs ?? 75;
  const references = await loadGuideDungeons(path.resolve(guideStepsDirectory));

  const achievementIds = TRACKS.flatMap((track) => track.achievementIds);
  const achievements: DofusDbAchievement[] = [];
  for (const id of achievementIds) {
    achievements.push(await requestJson(new URL("/achievements/" + id, baseUrl).toString(), (value) => dofusDbAchievementSchema.parse(value)));
    await sleep(requestDelayMs);
  }
  const achievementById = new Map(achievements.map((achievement) => [achievement.id, achievement]));

  const orderedQuestIds = TRACKS.flatMap((track) => track.achievementIds.flatMap((id) => {
    const achievement = achievementById.get(id);
    if (!achievement) throw new Error("Missing achievement " + id);
    return questIds(achievement);
  }));
  const quests: DofusDbQuest[] = [];
  for (const id of [...new Set(orderedQuestIds)]) {
    quests.push(await requestJson(new URL("/quests/" + id, baseUrl).toString(), (value) => dofusDbQuestSchema.parse(value)));
    await sleep(requestDelayMs);
  }
  const questById = new Map(quests.map((quest) => [quest.id, quest]));

  type ExtractedDungeon = { achievementId: number; quest: DofusDbQuest; step: DofusDbQuest["steps"][number]; dungeonId: number };
  const extracted = new Map<string, ExtractedDungeon[]>();
  for (const track of TRACKS) {
    const primaryEntries: ExtractedDungeon[] = [];
    for (const achievementId of track.achievementIds) {
      const achievement = achievementById.get(achievementId)!;
      for (const questId of questIds(achievement)) {
        const quest = questById.get(questId);
        if (!quest) throw new Error("Missing quest " + questId);
        for (const step of orderedQuestSteps(quest)) {
          const dungeonIds = [...new Set(step.objectives.flatMap((objective) => objective.need?.generated.dungeons ?? []))];
          const primaryDungeon = dungeonIds[0];
          if (primaryDungeon === undefined) continue;
          primaryEntries.push({ achievementId, quest, step, dungeonId: primaryDungeon });
        }
      }
    }
    // A quest step can mention a second, shared dungeon in generated metadata
    // (Rat Blanc/Noir both mention the Sphincter Cell lair). The achievement
    // itself advances once for the step's primary dungeon, so only the first
    // ordered dungeon is part of this track.
    const entries = primaryEntries;
    if (entries.length !== track.expected) {
      throw new Error(track.name + ": expected " + track.expected + " dungeons, received " + entries.length);
    }
    extracted.set(track.id, entries);
  }

  const dungeonIds = [...new Set([...extracted.values()].flat().map((entry) => entry.dungeonId))];
  const dungeons: DofusDbDungeon[] = [];
  for (const id of dungeonIds) {
    dungeons.push(await requestJson(new URL("/dungeons/" + id, baseUrl).toString(), (value) => dofusDbDungeonSchema.parse(value)));
    await sleep(requestDelayMs);
  }
  const bossIds = [...new Set(dungeons.flatMap((dungeon) => dungeon.bosses.slice(0, 1)))];
  const monsters: DofusDbMonster[] = [];
  for (const id of bossIds) {
    monsters.push(await requestJson(new URL("/monsters/" + id, baseUrl).toString(), (value) => dofusDbMonsterSchema.parse(value)));
    await sleep(requestDelayMs);
  }
  const dungeonById = new Map(dungeons.map((dungeon) => [dungeon.id, dungeon]));
  const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));

  const localImages = new Set<number>();
  if (!options.metadataOnly) {
    for (const monster of monsters) {
      if (!monster.img) continue;
      const target = path.resolve(imageDirectory, monster.id + ".png");
      if (!options.force && await exists(target)) {
        localImages.add(monster.id);
        continue;
      }
      const response = await request(monster.img);
      if (!(response.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) continue;
      await atomicWriteFile(target, bytes);
      localImages.add(monster.id);
      await sleep(options.imageDelayMs ?? 30);
    }
  }

  const tracks: WorldTourTrack[] = TRACKS.map((track) => {
    const entries = extracted.get(track.id) ?? [];
    const trackDungeons: WorldTourDungeon[] = entries.map((entry, index) => {
      const dungeon = dungeonById.get(entry.dungeonId);
      const bossId = dungeon?.bosses[0];
      const monster = bossId === undefined ? undefined : monsterById.get(bossId);
      if (!dungeon || !monster) throw new Error("Missing dungeon or monster for " + entry.dungeonId);
      const grade = [...monster.grades].sort((left, right) => left.grade - right.grade)[0];
      if (!grade) throw new Error("Missing monster grade for " + monster.id);
      const reference = guideReferenceFor(dungeon, references);
      return {
        order: index + 1,
        achievementId: entry.achievementId,
        questId: entry.quest.id,
        questName: entry.quest.name.fr ?? String(entry.quest.id),
        questStepId: entry.step.id,
        dungeonId: dungeon.id,
        dungeonName: dungeon.name.fr ?? String(dungeon.id),
        bossId: monster.id,
        bossName: monster.name.fr ?? String(monster.id),
        bossLevel: grade.level,
        bossLifePoints: grade.lifePoints,
        bossImageUrl: localImages.has(monster.id) ? "/world-tour/monsters/" + monster.id + ".png" : null,
        guideStep: reference?.step ?? null,
        dofusPourLesNoobsUrl: anchoredGuideUrl(reference?.link ?? null) ?? DUNGEON_GUIDE_URL_OVERRIDES.get(dungeon.id) ?? null,
      };
    });
    return { id: track.id, name: track.name, achievementIds: track.achievementIds, dungeons: trackDungeons };
  });

  const unmatched = tracks.flatMap((track) => track.dungeons.filter((dungeon) => dungeon.guideStep === null));
  if (unmatched.length > 0) {
    console.warn("[dofusdb] no local guide step for: " + unmatched.map((dungeon) => dungeon.dungeonName).join(", "));
  }

  const archive: WorldTourArchive = {
    source: new URL("/achievements", baseUrl).toString(),
    scrapedAt: new Date().toISOString(),
    tracks,
    raw: { achievements, quests, dungeons, monsters },
  };
  await atomicWriteFile(path.resolve(outputPath), Buffer.from(JSON.stringify(archive, null, 2) + "\n", "utf8"));
  console.info("[dofusdb] world tour saved to " + path.resolve(outputPath));
  return archive;
}
