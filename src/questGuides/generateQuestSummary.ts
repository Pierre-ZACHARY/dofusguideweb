import { z } from "zod";
import { retry } from "../utils/retry.js";
import { questGuideContentSchema, questGuideJsonSchema, type QuestGuideContent } from "./types.js";
import type { ExtractedQuestArticle } from "./extractDplnArticle.js";
import { generateQuestSummaryWithCline, type GenerateQuestSummaryWithClineOptions } from "./generateQuestSummaryWithCline.js";
import { questSummaryInput, questSummaryInstructions } from "./summaryPrompt.js";

const responseSchema = z.object({
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

class OpenAiHttpError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super("OpenAI Responses API returned HTTP " + status);
  }
}

export interface GenerateQuestSummaryOptions extends GenerateQuestSummaryWithClineOptions {
  provider?: "openai" | "cline";
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function outputText(payload: z.infer<typeof responseSchema>): string {
  const parts = payload.output.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && part.text !== undefined)
    .map((part) => part.text ?? "");
  if (parts.length === 0) throw new Error("OpenAI response did not contain output_text");
  return parts.join("");
}

export async function generateQuestSummary(
  article: ExtractedQuestArticle,
  options: GenerateQuestSummaryOptions = {},
): Promise<{ content: QuestGuideContent; model: string }> {
  if (options.provider === "cline") return generateQuestSummaryWithCline(article, options);
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error("OPENAI_API_KEY is required to generate quest summaries");
  }
  const model = options.model ?? process.env.DOFUSGUIDE_SUMMARY_MODEL ?? "gpt-5.4-mini";
  const requestFetch = options.fetch ?? fetch;
  const endpoint = new URL("responses", (options.apiBaseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/").replace(/\/?$/u, "/"));

  const response = await retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
    try {
      const result = await requestFetch(endpoint, {
        method: "POST",
        headers: {
          authorization: "Bearer " + apiKey,
          "content-type": "application/json",
          "user-agent": "DofusGuideScraper/0.1.0 (local quest summary generator)",
        },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "low" },
          instructions: questSummaryInstructions,
          input: questSummaryInput(article),
          text: {
            format: {
              type: "json_schema",
              name: "dofus_quest_summary",
              strict: true,
              schema: questGuideJsonSchema,
            },
          },
        }),
        signal: controller.signal,
      });
      if (!result.ok) throw new OpenAiHttpError(result.status, (await result.text()).slice(0, 1_000));
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    maxRetries: 3,
    shouldRetry: (error) => !(error instanceof OpenAiHttpError) || error.status === 408 || error.status === 429 || error.status >= 500,
    onRetry: (_error, retryNumber, delayMs) => console.warn("[summary] OpenAI retry " + retryNumber + " in " + delayMs + " ms"),
  });

  const payload = responseSchema.parse(await response.json());
  return { content: questGuideContentSchema.parse(JSON.parse(outputText(payload))), model };
}
