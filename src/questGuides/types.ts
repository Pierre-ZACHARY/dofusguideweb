import { z } from "zod";
import { questBestiarySchema } from "../bestiary/types.js";

export const questGuideActionSchema = z.object({
  instruction: z.string().trim().min(1).max(500),
  position: z.string().trim().min(1).max(80).nullable(),
  zoneHint: z.string().trim().min(1).max(160).nullable().optional(),
  warning: z.string().trim().min(1).max(300).nullable(),
  combat: z.enum(["NONE", "SOLO", "GROUP", "CHOICE"]).default("NONE"),
});

export const questGuideItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemId: z.number().int().positive().nullable().default(null),
  imageUrl: z.string().trim().min(1).nullable().default(null),
  dofusDbUrl: z.string().url().nullable().default(null),
});

export const questGuideContentSchema = z.object({
  overview: z.string().trim().min(1).max(800),
  recommendedLevel: z.number().int().positive().nullable(),
  prerequisites: z.array(z.string().trim().min(1).max(300)).max(20),
  rewards: z.array(z.string().trim().min(1).max(300)).max(20),
  preparation: z.array(z.string().trim().min(1).max(300)).max(30),
  actions: z.array(questGuideActionSchema).min(1).max(30),
  notes: z.array(z.string().trim().min(1).max(400)).max(20),
  npcs: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  items: z.array(questGuideItemSchema).max(40).default([]),
  bestiary: questBestiarySchema.optional(),
});

export const questGuideSummarySchema = questGuideContentSchema.extend({
  questKey: z.string().trim().min(1),
  sourceUrl: z.url(),
  sourceTitle: z.string().trim().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  generatedAt: z.iso.datetime(),
  model: z.string().trim().min(1),
});

export const questGuideArchiveSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  summaries: z.array(questGuideSummarySchema),
});

export type QuestGuideContent = z.infer<typeof questGuideContentSchema>;
export type QuestGuideSummary = z.infer<typeof questGuideSummarySchema>;
export type QuestGuideArchive = z.infer<typeof questGuideArchiveSchema>;

export const questGuideJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string", maxLength: 800 },
    recommendedLevel: { type: ["integer", "null"] },
    prerequisites: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
    rewards: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
    preparation: { type: "array", maxItems: 30, items: { type: "string", maxLength: 300 } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          instruction: { type: "string", maxLength: 500 },
          position: { type: ["string", "null"], maxLength: 80 },
          zoneHint: { type: ["string", "null"], maxLength: 160 },
          warning: { type: ["string", "null"], maxLength: 300 },
          combat: { type: "string", enum: ["NONE", "SOLO", "GROUP", "CHOICE"] },
        },
        required: ["instruction", "position", "zoneHint", "warning", "combat"],
      },
    },
    notes: { type: "array", maxItems: 20, items: { type: "string", maxLength: 400 } },
    npcs: { type: "array", maxItems: 40, items: { type: "string", maxLength: 120 } },
    items: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: 120 },
          itemId: { type: ["integer", "null"] },
          imageUrl: { type: ["string", "null"] },
          dofusDbUrl: { type: ["string", "null"] },
        },
        required: ["name", "itemId", "imageUrl", "dofusDbUrl"],
      },
    },
  },
  required: ["overview", "recommendedLevel", "prerequisites", "rewards", "preparation", "actions", "notes", "npcs", "items"],
} as const;
