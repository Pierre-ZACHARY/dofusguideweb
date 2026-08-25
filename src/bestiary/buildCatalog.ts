import type { BestiaryCatalog } from "./types.js";
import { localizedFrench } from "./types.js";

type RawRecord = Record<string, unknown>;

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry === "number" && Number.isInteger(entry)) return [entry];
    if (typeof entry === "object" && entry !== null && typeof (entry as RawRecord).id === "number") return [(entry as RawRecord).id as number];
    return [];
  }))];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function monsterLevel(raw: RawRecord): number {
  const grades = Array.isArray(raw.grades) ? raw.grades : [];
  const levels = grades.flatMap((grade) => {
    if (typeof grade !== "object" || grade === null) return [];
    const level = numberValue((grade as RawRecord).level);
    return level === null ? [] : [level];
  });
  return levels.length === 0 ? 0 : Math.min(...levels);
}

function imageUrl(raw: RawRecord): string | null {
  return typeof raw.img === "string" ? raw.img : typeof raw.imageUrl === "string" ? raw.imageUrl : null;
}

function achievementIsMonster(raw: RawRecord): boolean {
  const category = typeof raw.category === "object" && raw.category !== null ? raw.category as RawRecord : {};
  const parent = typeof category.parent === "object" && category.parent !== null ? category.parent as RawRecord : {};
  return parent.id === 25 || category.parentId === 25 || localizedFrench(parent.name) === "Monstres";
}

export function achievementMonsterIds(raw: RawRecord): number[] {
  if (!achievementIsMonster(raw)) return [];
  const objectives = Array.isArray(raw.objectives) ? raw.objectives : [];
  const ids = objectives.flatMap((objective) => {
    if (typeof objective !== "object" || objective === null) return [];
    const criterion = (objective as RawRecord).criterion;
    if (typeof criterion !== "string") return [];
    return [...criterion.matchAll(/(?:^|[&(])Ef>(\d+)/gu)].map((match) => Number(match[1]));
  });
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

function coordinateKey(x: number, y: number): string {
  return x + "," + y;
}

export function buildBestiaryCatalog(input: {
  source: string;
  scrapedAt: string;
  monsters: RawRecord[];
  dungeons: RawRecord[];
  achievements: RawRecord[];
  subareas: RawRecord[];
  mapPositions: RawRecord[];
}): BestiaryCatalog {
  const monsters = input.monsters.flatMap((raw) => {
    const id = numberValue(raw.id);
    const name = localizedFrench(raw.name);
    if (id === null || id <= 0 || name === null) return [];
    const isBounty = raw.isBounty === true;
    return [{
      id,
      name,
      level: monsterLevel(raw),
      imageUrl: imageUrl(raw),
      subareaIds: numberArray(raw.subareas),
      isArchmonster: raw.isMiniBoss === true && !isBounty,
      isBounty,
    }];
  }).sort((left, right) => left.id - right.id);

  const subareas = input.subareas.flatMap((raw) => {
    const id = numberValue(raw.id);
    const name = localizedFrench(raw.name);
    if (id === null || id <= 0 || name === null) return [];
    return [{ id, name, monsterIds: numberArray(raw.monsters) }];
  }).sort((left, right) => left.id - right.id);

  const achievements = input.achievements.flatMap((raw) => {
    const id = numberValue(raw.id);
    const name = localizedFrench(raw.name);
    const monsterIds = achievementMonsterIds(raw);
    return id !== null && id > 0 && name !== null && monsterIds.length > 0 ? [{ id, name, monsterIds }] : [];
  }).sort((left, right) => left.id - right.id);

  const dungeons = input.dungeons.flatMap((raw) => {
    const id = numberValue(raw.id);
    const name = localizedFrench(raw.name);
    if (id === null || id <= 0 || name === null) return [];
    return [{
      id,
      name,
      level: numberValue(raw.minLevel) ?? numberValue(raw.optimalPlayerLevel) ?? 0,
      bossIds: numberArray(raw.bosses),
      monsterIds: numberArray(raw.monsters),
      subareaId: numberValue(raw.subareaId) ?? (typeof raw.subarea === "object" && raw.subarea !== null ? numberValue((raw.subarea as RawRecord).id) : null),
    }];
  }).sort((left, right) => left.id - right.id);

  const coordinateCandidates = new Map<string, Array<{ subareaId: number; priority: number }>>();
  for (const raw of input.mapPositions) {
    const x = numberValue(raw.posX);
    const y = numberValue(raw.posY);
    const subareaId = numberValue(raw.subAreaId);
    if (x === null || y === null || subareaId === null || subareaId <= 0) continue;
    const priority = (raw.hasPriorityOnWorldmap === true ? 2 : 0) + (raw.worldMap === 1 ? 1 : 0);
    const key = coordinateKey(x, y);
    coordinateCandidates.set(key, [...coordinateCandidates.get(key) ?? [], { subareaId, priority }]);
  }
  const coordinates: Record<string, number[]> = {};
  for (const [key, candidates] of coordinateCandidates) {
    coordinates[key] = [...new Map(
      candidates
        .sort((left, right) => right.priority - left.priority || left.subareaId - right.subareaId)
        .map((candidate) => [candidate.subareaId, candidate.subareaId]),
    ).values()];
  }

  return { version: 1, source: input.source, scrapedAt: input.scrapedAt, monsters, dungeons, achievements, subareas, coordinates };
}
