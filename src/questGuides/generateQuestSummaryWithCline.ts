import { spawn } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ExtractedQuestArticle } from "./extractDplnArticle.js";
import { questSummaryInput, questSummaryInstructions } from "./summaryPrompt.js";
import { questGuideContentSchema, questGuideJsonSchema, type QuestGuideContent } from "./types.js";

const runResultSchema = z.object({
  type: z.literal("run_result"),
  finishReason: z.string(),
  text: z.string(),
  model: z.object({ id: z.string().min(1) }).optional(),
});

export interface GenerateQuestSummaryWithClineOptions {
  model?: string;
  timeoutMs?: number;
  clineBin?: string;
  nodeExecutable?: string;
}

function unfenceJson(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseClineJsonOutput(stdout: string): { content: QuestGuideContent; model?: string } {
  const results = stdout.split(/\r?\n/u).flatMap((line) => {
    if (line.trim() === "") return [];
    try {
      const parsed: unknown = JSON.parse(line);
      const result = runResultSchema.safeParse(parsed);
      return result.success ? [result.data] : [];
    } catch {
      return [];
    }
  });
  const result = results.at(-1);
  if (result === undefined) throw new Error("Cline output did not contain a run_result event");
  if (result.finishReason !== "completed") throw new Error("Cline run did not complete: " + result.finishReason);
  return {
    content: questGuideContentSchema.parse(JSON.parse(unfenceJson(result.text))),
    ...(result.model === undefined ? {} : { model: result.model.id }),
  };
}

async function defaultClineBin(): Promise<string> {
  const configured = process.env.CLINE_CLI_BIN;
  if (configured !== undefined && configured.trim() !== "") return path.resolve(configured);
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "cline", "bin", "cline");
  await access(candidate);
  return candidate;
}

function runCline(
  executable: string,
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [bin, ...args], {
      cwd,
      windowsHide: true,
      shell: false,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const maxBytes = 10 * 1024 * 1024;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBytes) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBytes) stderr.push(chunk);
      else child.kill();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("Cline timed out after " + timeoutMs + " ms"));
        return;
      }
      if (stdoutBytes > maxBytes || stderrBytes > maxBytes) {
        reject(new Error("Cline output exceeded 10 MiB"));
        return;
      }
      if (code !== 0) {
        reject(new Error("Cline exited with code " + String(code) + ": " + Buffer.concat(stderr).toString("utf8").slice(-2_000)));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

export async function generateQuestSummaryWithCline(
  article: ExtractedQuestArticle,
  options: GenerateQuestSummaryWithClineOptions = {},
): Promise<{ content: QuestGuideContent; model: string }> {
  const model = options.model ?? process.env.DOFUSGUIDE_SUMMARY_MODEL ?? "cline-pass/deepseek-v4-pro";
  const timeoutMs = options.timeoutMs ?? 660_000;
  const workspace = await mkdtemp(path.join(os.tmpdir(), "dofusguide-cline-"));
  try {
    await writeFile(path.join(workspace, "request.json"), JSON.stringify({
      instructions: questSummaryInstructions,
      input: questSummaryInput(article),
      outputSchema: questGuideJsonSchema,
    }, null, 2), "utf8");
    const executable = options.nodeExecutable ?? process.execPath;
    const bin = options.clineBin ?? await defaultClineBin();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const output = await runCline(
          executable,
          bin,
          [
            "--json",
            "-P", "cline",
            "-m", model,
            "--thinking", "low",
            "--compaction", "off",
            "--retries", "2",
            "--timeout", String(Math.max(1, Math.floor((timeoutMs - 30_000) / 1_000))),
            "--auto-approve", "true",
            "-c", workspace,
            "Lis request.json avec l'outil de lecture. N'utilise aucun réseau et ne modifie aucun fichier. Respecte strictement toutes les limites du schéma JSON. Réponds uniquement avec l'objet JSON demandé, sans bloc Markdown.",
          ],
          workspace,
          timeoutMs,
        );
        const parsed = parseClineJsonOutput(output);
        return { content: parsed.content, model: parsed.model ?? model };
      } catch (error) {
        lastError = error;
        if (attempt < 2) console.warn("[summary] invalid Cline result; retrying once: " + (error instanceof Error ? error.message : String(error)));
      }
    }
    throw lastError;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
