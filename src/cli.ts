import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DofusGuideClient, type DofusGuideClientOptions } from "./api/dofusGuideClient.js";
import { scrapeGuide, scrapeGuideStep } from "./scraper/scrapeGuide.js";
import { scrapeGuides } from "./scraper/scrapeGuides.js";

function parseInteger(value: string, optionName: string): number {
  const result = Number(value);
  if (!Number.isInteger(result)) {
    throw new Error(`${optionName} must be an integer`);
  }
  return result;
}

function parseNonNegativeInteger(value: string, optionName: string): number {
  const result = parseInteger(value, optionName);
  if (result < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return result;
}

function parsePositiveInteger(value: string, optionName: string): number {
  const result = parseNonNegativeInteger(value, optionName);
  if (result === 0) {
    throw new Error(`${optionName} must be greater than zero`);
  }
  return result;
}

export function normalizeCliArgs(args: string[]): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const nextArgument = args[index + 1];
    if (
      (argument === "--guide" || argument === "--fallback-guide-id") &&
      nextArgument !== undefined &&
      /^-\d+$/.test(nextArgument)
    ) {
      normalized.push(`${argument}=${nextArgument}`);
      index += 1;
      continue;
    }
    if (argument !== undefined) {
      normalized.push(argument);
    }
  }

  return normalized;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { positionals, values } = parseArgs({
    args: normalizeCliArgs(args),
    allowPositionals: true,
    strict: true,
    options: {
      "base-url": { type: "string" },
      "delay-ms": { type: "string" },
      "fallback-guide-id": { type: "string" },
      force: { type: "boolean" },
      guide: { type: "string" },
      "guide-name": { type: "string" },
      output: { type: "string" },
      refresh: { type: "boolean" },
      retries: { type: "string" },
      resume: { type: "boolean" },
      "start-step": { type: "string" },
      step: { type: "string" },
      "stop-after-empty": { type: "string" },
      "timeout-ms": { type: "string" },
      "user-agent": { type: "string" },
    },
  });

  const command = positionals[0];
  if (positionals.length !== 1 || (command !== "guides" && command !== "scrape")) {
    throw new Error("Usage: npm run guides | npm run scrape -- --guide <id> --step <number>");
  }

  const baseUrl = values["base-url"] ?? process.env.DOFUSGUIDE_BASE_URL;
  const userAgent = values["user-agent"] ?? process.env.DOFUSGUIDE_USER_AGENT;
  const clientOptions: DofusGuideClientOptions = {
    timeoutMs: parsePositiveInteger(
      values["timeout-ms"] ?? process.env.DOFUSGUIDE_TIMEOUT_MS ?? "15000",
      "--timeout-ms",
    ),
    maxRetries: parseNonNegativeInteger(
      values.retries ?? process.env.DOFUSGUIDE_RETRIES ?? "3",
      "--retries",
    ),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };

  const client = new DofusGuideClient(clientOptions);
  if (command === "guides") {
    if (
      values["delay-ms"] !== undefined ||
      values["fallback-guide-id"] !== undefined ||
      values.force !== undefined ||
      values.guide !== undefined ||
      values["guide-name"] !== undefined ||
      values.refresh !== undefined ||
      values.resume !== undefined ||
      values["start-step"] !== undefined ||
      values.step !== undefined ||
      values["stop-after-empty"] !== undefined
    ) {
      throw new Error("Scraping options are only valid with the scrape command");
    }
    await scrapeGuides({
      client,
      outputFile: path.resolve(values.output ?? path.join("data", "raw", "guides.json")),
    });
    return;
  }

  if (values.output !== undefined) {
    throw new Error("--output is only valid with the guides command");
  }
  if (values.guide !== undefined && values["guide-name"] !== undefined) {
    throw new Error("--guide and --guide-name cannot be used together");
  }
  if ([values.resume, values.force, values.refresh].filter((value) => value === true).length > 1) {
    throw new Error("--resume, --force and --refresh are mutually exclusive");
  }

  if (values.step !== undefined) {
    if (values.guide === undefined) {
      throw new Error("A one-step scrape requires --guide <id>");
    }
    if (
      values["delay-ms"] !== undefined ||
      values["fallback-guide-id"] !== undefined ||
      values["guide-name"] !== undefined ||
      values.resume === true ||
      values["start-step"] !== undefined ||
      values["stop-after-empty"] !== undefined
    ) {
      throw new Error("Sequential scraping options cannot be combined with --step");
    }
    await scrapeGuideStep({
      client,
      guideId: parseInteger(values.guide, "--guide"),
      step: parsePositiveInteger(values.step, "--step"),
      force: values.force ?? false,
      refresh: values.refresh ?? false,
    });
    return;
  }

  await scrapeGuide({
    client,
    ...(values.guide === undefined
      ? {}
      : { guideId: parseInteger(values.guide, "--guide") }),
    ...(values["guide-name"] === undefined ? {} : { guideName: values["guide-name"] }),
    ...(values["fallback-guide-id"] === undefined
      ? {}
      : {
          fallbackGuideId: parseInteger(
            values["fallback-guide-id"],
            "--fallback-guide-id",
          ),
        }),
    resume: values.resume ?? false,
    force: values.force ?? false,
    refresh: values.refresh ?? false,
    ...(values["delay-ms"] === undefined
      ? {}
      : { delayMs: parseNonNegativeInteger(values["delay-ms"], "--delay-ms") }),
    ...(values["start-step"] === undefined
      ? {}
      : { startStep: parsePositiveInteger(values["start-step"], "--start-step") }),
    ...(values["stop-after-empty"] === undefined
      ? {}
      : {
          stopAfterEmpty: parsePositiveInteger(
            values["stop-after-empty"],
            "--stop-after-empty",
          ),
        }),
  });
}

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? `[error] ${error.message}` : `[error] ${String(error)}`,
    );
    process.exitCode = 1;
  });
}
