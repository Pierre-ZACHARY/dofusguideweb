import { z } from "zod";

const localizedTextSchema = z.record(z.string(), z.string());

export const dofusDbItemSchema = z.object({
  id: z.number().int(),
  typeId: z.number().int(),
  level: z.number().int().nonnegative().optional(),
  iconId: z.number().int().nullable().optional(),
  name: localizedTextSchema,
  description: localizedTextSchema,
  img: z.string().url().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const dofusDbItemPageSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  skip: z.number().int().nonnegative(),
  data: z.array(dofusDbItemSchema),
});

export type DofusDbItem = z.infer<typeof dofusDbItemSchema>;

export interface DofusDbItemArchive {
  source: string;
  scrapedAt: string;
  total: number;
  items: DofusDbItem[];
}
