import { z } from "zod";
import { questBestiarySchema } from "../bestiary/types.js";

export const questGuideActionSchema = z.object({
  instruction: z.string().trim().min(1).max(1200),
  position: z.string().trim().min(1).max(80).nullable(),
  zoneHint: z.string().trim().min(1).max(160).nullable().optional(),
  warning: z.string().trim().min(1).max(1200).nullable(),
  combat: z.enum(["NONE", "SOLO", "GROUP", "CHOICE"]).default("NONE"),
});

export const questGuideItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemId: z.number().int().positive().nullable().default(null),
  imageUrl: z.string().trim().min(1).nullable().default(null),
  dofusDbUrl: z.string().url().nullable().default(null),
});

export const questGuideContentSchema = z.object({
  overview: z.string().trim().min(1).max(1200),
  recommendedLevel: z.number().int().positive().nullable(),
  prerequisites: z.array(z.string().trim().min(1).max(1200)).max(20),
  rewards: z.array(z.string().trim().min(1).max(1200)).max(20),
  preparation: z.array(z.string().trim().min(1).max(1200)).max(30),
  actions: z.array(questGuideActionSchema).min(1).max(30),
  notes: z.array(z.string().trim().min(1).max(1200)).max(20),
  npcs: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  items: z.array(questGuideItemSchema).max(40).default([]),
  bestiary: questBestiarySchema.optional(),
});

export const questGuideSummarySchema = questGuideContentSchema.extend({
  questKey: z.string().trim().min(1),
  sourceUrl: z.url(),
  sourceTitle: z.string().trim().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  generatedAt: z.iso.datetime().nullable().default(null),
  model: z.string().trim().min(1).nullable().default(null),
});

export const questGuideArchiveSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  summaries: z.array(questGuideSummarySchema),
});

export const questGuideStepTipSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(800),
  questKeys: z.array(z.string().trim().min(1)).min(2).max(20)
    .refine((keys) => new Set(keys).size === keys.length, "questKeys must be unique"),
  actions: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
});

export const questGuideStepArchiveSchema = z.object({
  version: z.literal(2),
  guideId: z.number().int(),
  stepNumber: z.number().int().positive(),
  updatedAt: z.iso.datetime().nullable().default(null),
  summaries: z.array(questGuideSummarySchema).max(50),
  tips: z.array(questGuideStepTipSchema).max(20),
}).superRefine((archive, context) => {
  const summaryKeys = new Set<string>();
  for (const summary of archive.summaries) {
    if (summaryKeys.has(summary.questKey)) {
      context.addIssue({ code: "custom", path: ["summaries"], message: "questKey must be unique inside a step" });
    }
    summaryKeys.add(summary.questKey);
  }
  for (const [tipIndex, tip] of archive.tips.entries()) {
    for (const questKey of tip.questKeys) {
      if (!summaryKeys.has(questKey)) {
        context.addIssue({ code: "custom", path: ["tips", tipIndex, "questKeys"], message: "tips may only reference summarized quests from the current step" });
      }
    }
  }
});

export type QuestGuideContent = z.infer<typeof questGuideContentSchema>;
export type QuestGuideSummary = z.infer<typeof questGuideSummarySchema>;
export type QuestGuideArchive = z.infer<typeof questGuideArchiveSchema>;
export type QuestGuideStepTip = z.infer<typeof questGuideStepTipSchema>;
export type QuestGuideStepArchive = z.infer<typeof questGuideStepArchiveSchema>;

export const questGuideJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string", maxLength: 1200 },
    recommendedLevel: { type: ["integer", "null"] },
    prerequisites: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1200 } },
    rewards: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1200 } },
    preparation: { type: "array", maxItems: 30, items: { type: "string", maxLength: 1200 } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          instruction: { type: "string", maxLength: 1200 },
          position: { type: ["string", "null"], maxLength: 80 },
          zoneHint: { type: ["string", "null"], maxLength: 160 },
          warning: { type: ["string", "null"], maxLength: 1200 },
          combat: { type: "string", enum: ["NONE", "SOLO", "GROUP", "CHOICE"] },
        },
        required: ["instruction", "position", "zoneHint", "warning", "combat"],
      },
    },
    notes: { type: "array", maxItems: 20, items: { type: "string", maxLength: 1200 } },
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

export const questGuideStepJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "integer", const: 2 },
    guideId: { type: "integer" },
    stepNumber: { type: "integer", minimum: 1 },
    updatedAt: { type: ["string", "null"], format: "date-time" },
    summaries: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          questKey: { type: "string" },
          sourceUrl: { type: "string", format: "uri" },
          sourceTitle: { type: "string" },
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          generatedAt: { type: ["string", "null"], format: "date-time" },
          model: { type: ["string", "null"] },
          ...questGuideJsonSchema.properties,
        },
        required: [
          "questKey", "sourceUrl", "sourceTitle", "sourceHash", "generatedAt", "model",
          ...questGuideJsonSchema.required,
        ],
      },
    },
    tips: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 120 },
          description: { type: "string", maxLength: 800 },
          questKeys: { type: "array", minItems: 2, maxItems: 20, uniqueItems: true, items: { type: "string" } },
          actions: { type: "array", maxItems: 10, items: { type: "string", maxLength: 400 } },
        },
        required: ["title", "description", "questKeys", "actions"],
      },
    },
  },
  required: ["version", "guideId", "stepNumber", "updatedAt", "summaries", "tips"],
} as const;
