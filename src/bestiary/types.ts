import { z } from "zod";

const localizedTextSchema = z.record(z.string(), z.string()).optional();

export const dofusDbPageSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  skip: z.number().int().nonnegative(),
  data: z.array(z.record(z.string(), z.unknown())),
});

export const bestiaryMonsterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  level: z.number().int().nonnegative(),
  imageUrl: z.string().nullable(),
  subareaIds: z.array(z.number().int()),
  isArchmonster: z.boolean(),
  isBounty: z.boolean(),
});

export const bestiarySubareaSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  monsterIds: z.array(z.number().int().positive()),
});

export const bestiaryAchievementSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  monsterIds: z.array(z.number().int().positive()),
});

export const bestiaryDungeonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  level: z.number().int().nonnegative(),
  bossIds: z.array(z.number().int().positive()),
  monsterIds: z.array(z.number().int().positive()),
  subareaId: z.number().int().positive().nullable(),
});

export const bestiaryCatalogSchema = z.object({
  version: z.literal(1),
  source: z.string().url(),
  scrapedAt: z.iso.datetime(),
  monsters: z.array(bestiaryMonsterSchema),
  dungeons: z.array(bestiaryDungeonSchema),
  achievements: z.array(bestiaryAchievementSchema),
  subareas: z.array(bestiarySubareaSchema),
  coordinates: z.record(z.string(), z.array(z.number().int().positive())),
});

export const questZoneSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  coordinates: z.array(z.string()),
});

export const questBestiaryMonsterSchema = bestiaryMonsterSchema.pick({
  id: true,
  name: true,
  level: true,
  imageUrl: true,
});

export const questBestiaryAchievementSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  monsters: z.array(questBestiaryMonsterSchema),
});

export const questBestiarySchema = z.object({
  zones: z.array(questZoneSchema),
  bounties: z.array(questBestiaryMonsterSchema),
  archmonsters: z.array(questBestiaryMonsterSchema),
  achievements: z.array(questBestiaryAchievementSchema),
});

export type BestiaryCatalog = z.infer<typeof bestiaryCatalogSchema>;
export type BestiaryMonster = z.infer<typeof bestiaryMonsterSchema>;
export type QuestBestiary = z.infer<typeof questBestiarySchema>;

export function localizedFrench(value: unknown): string | null {
  const parsed = localizedTextSchema.safeParse(value);
  return parsed.success ? parsed.data?.fr ?? Object.values(parsed.data ?? {})[0] ?? null : null;
}
