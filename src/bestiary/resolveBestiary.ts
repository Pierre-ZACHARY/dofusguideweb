import { readFile } from "node:fs/promises";
import path from "node:path";
import { bestiaryCatalogSchema, type BestiaryCatalog, type BestiaryMonster, type QuestBestiary } from "./types.js";
import type { QuestGuideContent } from "../questGuides/types.js";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/gu, " ").trim();
}

export async function loadBestiaryCatalog(catalogPath = "data/dofusdb/bestiary.json"): Promise<BestiaryCatalog> {
  return bestiaryCatalogSchema.parse(JSON.parse(await readFile(path.resolve(catalogPath), "utf8")));
}

export function queryBestiaryZone(catalog: BestiaryCatalog, zoneName: string): { zones: BestiaryCatalog["subareas"]; monsters: BestiaryMonster[] } {
  const tokens = normalize(zoneName).split(" ").filter((token) => token.length > 1);
  const zones = catalog.subareas.filter((zone) => {
    const name = normalize(zone.name);
    return tokens.every((token) => name.includes(token));
  });
  const ids = new Set(zones.flatMap((zone) => zone.monsterIds));
  for (const monster of catalog.monsters) if (monster.subareaIds.some((id) => zones.some((zone) => zone.id === id))) ids.add(monster.id);
  return { zones, monsters: catalog.monsters.filter((monster) => ids.has(monster.id)) };
}

export function extractCoordinates(content: Pick<QuestGuideContent, "actions">): string[] {
  const result: string[] = [];
  for (const action of content.actions) {
    const values = [action.position, action.instruction, action.warning].filter((value): value is string => value !== null);
    for (const value of values) {
      for (const match of value.matchAll(/\[?(-?\d{1,3})\s*[,;]\s*(-?\d{1,3})\]?/gu)) result.push(match[1] + "," + match[2]);
    }
  }
  return [...new Set(result)];
}

function actionCoordinates(action: QuestGuideContent["actions"][number]): string[] {
  return extractCoordinates({ actions: [action] });
}

const zoneStopWords = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "dans", "en", "au", "aux", "une", "un", "zone"]);

function zoneMatchScore(zoneName: string, hint: string): number {
  const zone = normalize(zoneName);
  const normalizedHint = normalize(hint);
  if (zone === normalizedHint) return 100;
  if (normalizedHint.includes(zone)) return 90;
  if (normalizedHint.length >= 4 && zone.includes(normalizedHint)) return 80;
  const tokens = zone.split(" ").filter((token) => token.length > 1 && !zoneStopWords.has(token));
  if (tokens.length === 0) return 0;
  const matched = tokens.filter((token) => normalizedHint.includes(token)).length;
  return matched === tokens.length ? 60 + matched : 0;
}

function resolveNamedSubarea(catalog: BestiaryCatalog, zoneHint: string): number | null {
  return catalog.subareas
    .map((subarea) => ({ id: subarea.id, score: zoneMatchScore(subarea.name, zoneHint) }))
    .filter((subarea) => subarea.score >= 90)
    .sort((left, right) => right.score - left.score || left.id - right.id)[0]?.id ?? null;
}

export function resolveCoordinateSubarea(
  catalog: BestiaryCatalog,
  coordinate: string,
  zoneHint: string | null | undefined,
): number | null {
  const candidates = catalog.coordinates[coordinate] ?? [];
  if (zoneHint === null || zoneHint === undefined || zoneHint.trim() === "") return candidates[0] ?? null;
  const subareas = new Map(catalog.subareas.map((subarea) => [subarea.id, subarea]));
  const ranked = candidates.map((id, order) => ({ id, order, score: zoneMatchScore(subareas.get(id)?.name ?? "", zoneHint) }))
    .sort((left, right) => right.score - left.score || left.order - right.order);
  if ((ranked[0]?.score ?? 0) > 0) return ranked[0]!.id;

  // Indoor maps often reuse the coordinates of their outdoor entrance and are
  // therefore absent from the coordinate index. A precise source-backed hint
  // may still select that subarea directly from the complete DofusDB catalog.
  return resolveNamedSubarea(catalog, zoneHint) ?? candidates[0] ?? null;
}

function publicMonster(monster: BestiaryMonster) {
  return { id: monster.id, name: monster.name, level: monster.level, imageUrl: monster.imageUrl };
}

export function enrichQuestGuideBestiary(content: QuestGuideContent, catalog: BestiaryCatalog): QuestBestiary {
  const subareasById = new Map(catalog.subareas.map((subarea) => [subarea.id, subarea]));
  const coordinateZones = new Map<number, string[]>();
  for (const action of content.actions) {
    const contextualHint = action.zoneHint ?? [action.instruction, action.warning].filter((value): value is string => value !== null).join(" ");
    const coordinates = actionCoordinates(action);
    if (coordinates.length === 0 && action.zoneHint !== null && action.zoneHint !== undefined) {
      const namedSubareaId = resolveNamedSubarea(catalog, action.zoneHint);
      if (namedSubareaId !== null && !coordinateZones.has(namedSubareaId)) coordinateZones.set(namedSubareaId, []);
    }
    for (const coordinate of coordinates) {
      const subareaId = resolveCoordinateSubarea(catalog, coordinate, contextualHint);
      if (subareaId !== null) coordinateZones.set(subareaId, [...coordinateZones.get(subareaId) ?? [], coordinate]);
    }
  }
  const zones = [...coordinateZones].flatMap(([id, zoneCoordinates]) => {
    const zone = subareasById.get(id);
    return zone === undefined ? [] : [{ id, name: zone.name, coordinates: [...new Set(zoneCoordinates)] }];
  }).sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const availableMonsterIds = new Set(zones.flatMap((zone) => subareasById.get(zone.id)?.monsterIds ?? []));
  for (const monster of catalog.monsters) if (monster.subareaIds.some((id) => zoneIds.has(id))) availableMonsterIds.add(monster.id);
  const available = catalog.monsters.filter((monster) => availableMonsterIds.has(monster.id));
  const byId = new Map(catalog.monsters.map((monster) => [monster.id, monster]));
  const sort = (left: BestiaryMonster, right: BestiaryMonster) => left.level - right.level || left.name.localeCompare(right.name, "fr");
  return {
    zones,
    bounties: available.filter((monster) => monster.isBounty).sort(sort).map(publicMonster),
    archmonsters: available.filter((monster) => monster.isArchmonster).sort(sort).map(publicMonster),
    achievements: catalog.achievements.flatMap((achievement) => {
      const monsters = achievement.monsterIds.filter((id) => availableMonsterIds.has(id)).flatMap((id) => {
        const monster = byId.get(id);
        return monster === undefined ? [] : [publicMonster(monster)];
      });
      return monsters.length === 0 ? [] : [{ id: achievement.id, name: achievement.name, monsters }];
    }).sort((left, right) => left.name.localeCompare(right.name, "fr")),
  };
}
