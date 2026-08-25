import { z } from "zod";

const localizedTextSchema = z.record(z.string(), z.string());

export const dofusDbBreedSchema = z.object({
  id: z.number().int(),
  shortName: localizedTextSchema,
  description: localizedTextSchema.optional(),
  gameplayDescription: localizedTextSchema.optional(),
  img: z.string().url().nullable().optional(),
  imgTransparent: z.string().url().nullable().optional(),
  heads: z.object({
    male: z.string().url().nullable().optional(),
    female: z.string().url().nullable().optional(),
  }).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const dofusDbBreedPageSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  skip: z.number().int().nonnegative(),
  data: z.array(dofusDbBreedSchema),
});

export type DofusDbBreed = z.infer<typeof dofusDbBreedSchema>;

export interface DofusDbBreedArchive {
  source: string;
  scrapedAt: string;
  total: number;
  breeds: DofusDbBreed[];
}
