import { z } from "zod";

const localizedTextSchema = z.record(z.string(), z.string());

export const dofusDbAchievementSchema = z.object({
  id: z.number().int(),
  name: localizedTextSchema,
  objectives: z.array(z.object({
    order: z.number().int(),
    criterion: z.string(),
  }).passthrough()),
}).passthrough();

export const dofusDbQuestSchema = z.object({
  id: z.number().int(),
  name: localizedTextSchema,
  stepIds: z.array(z.number().int()),
  steps: z.array(z.object({
    id: z.number().int(),
    name: localizedTextSchema,
    objectives: z.array(z.object({
      id: z.number().int(),
      typeId: z.number().int(),
      className: z.string(),
      parameters: z.object({
        parameter0: z.number().int().optional(),
      }).passthrough().optional(),
      need: z.object({
        generated: z.object({
          dungeons: z.array(z.number().int()),
        }).passthrough(),
      }).passthrough().nullable().optional(),
    }).passthrough()),
  }).passthrough()),
}).passthrough();

export const dofusDbDungeonSchema = z.object({
  id: z.number().int(),
  name: localizedTextSchema,
  minLevel: z.number().int().nullable().optional(),
  bosses: z.array(z.number().int()),
}).passthrough();

export const dofusDbMonsterSchema = z.object({
  id: z.number().int(),
  name: localizedTextSchema,
  img: z.string().url().nullable().optional(),
  grades: z.array(z.object({
    grade: z.number().int(),
    level: z.number().int(),
    lifePoints: z.number().int(),
  }).passthrough()),
}).passthrough();

export const worldTourDungeonSchema = z.object({
  order: z.number().int().positive(),
  achievementId: z.number().int(),
  questId: z.number().int(),
  questName: z.string(),
  questStepId: z.number().int(),
  dungeonId: z.number().int(),
  dungeonName: z.string(),
  bossId: z.number().int(),
  bossName: z.string(),
  bossLevel: z.number().int(),
  bossLifePoints: z.number().int(),
  bossImageUrl: z.string().nullable(),
  guideStep: z.number().int().positive().nullable(),
  dofusPourLesNoobsUrl: z.string().url().nullable(),
});

export const worldTourTrackSchema = z.object({
  id: z.enum(["metag-robill", "emma-tompouce"]),
  name: z.string(),
  achievementIds: z.array(z.number().int()),
  dungeons: z.array(worldTourDungeonSchema),
});

export const worldTourArchiveSchema = z.object({
  source: z.string().url(),
  scrapedAt: z.string(),
  tracks: z.array(worldTourTrackSchema),
  raw: z.object({
    achievements: z.array(z.unknown()),
    quests: z.array(z.unknown()),
    dungeons: z.array(z.unknown()),
    monsters: z.array(z.unknown()),
  }),
});

export type DofusDbAchievement = z.infer<typeof dofusDbAchievementSchema>;
export type DofusDbQuest = z.infer<typeof dofusDbQuestSchema>;
export type DofusDbDungeon = z.infer<typeof dofusDbDungeonSchema>;
export type DofusDbMonster = z.infer<typeof dofusDbMonsterSchema>;
export type WorldTourDungeon = z.infer<typeof worldTourDungeonSchema>;
export type WorldTourTrack = z.infer<typeof worldTourTrackSchema>;
export type WorldTourArchive = z.infer<typeof worldTourArchiveSchema>;
