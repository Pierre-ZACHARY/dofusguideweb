import { z } from "zod";

const localizedTextSchema = z.record(z.string(), z.string());

export const dofusDbChallengeSchema = z.object({
  id: z.number().int(),
  iconId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  completionCriterion: z.string().nullable().optional(),
  activationCriterion: z.string().nullable().optional(),
  targetMonsterId: z.number().int().nullable().optional(),
  incompatibleChallenges: z.array(z.number().int()).optional(),
  name: localizedTextSchema,
  description: localizedTextSchema,
  slug: localizedTextSchema.optional(),
  img: z.string().url().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const dofusDbChallengePageSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  skip: z.number().int().nonnegative(),
  data: z.array(dofusDbChallengeSchema),
});

export type DofusDbChallenge = z.infer<typeof dofusDbChallengeSchema>;

export interface DofusDbChallengeArchive {
  source: string;
  scrapedAt: string;
  total: number;
  challenges: DofusDbChallenge[];
}
