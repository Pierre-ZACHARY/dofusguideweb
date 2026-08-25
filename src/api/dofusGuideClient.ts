import type { GuideElement, GuideMetadata, RawJsonDocument } from "../types/dofusGuide.js";
import { retry } from "../utils/retry.js";
import type { Sleep } from "../utils/sleep.js";

const DEFAULT_BASE_URL = "https://dofusguide.fr";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_USER_AGENT = "DofusGuideScraper/0.1.0 (local archival client)";

export type Fetch = typeof fetch;

export interface DofusGuideClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
  fetch?: Fetch;
  sleep?: Sleep;
  logger?: Pick<Console, "info" | "warn">;
  now?: () => number;
}

export class DofusGuideHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, url: string, retryAfterMs?: number) {
    super(message);
    this.name = "DofusGuideHttpError";
    this.status = status;
    this.url = url;
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
  }
}

export class DofusGuideNetworkError extends Error {
  readonly url: string;

  constructor(message: string, url: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DofusGuideNetworkError";
    this.url = url;
  }
}

export class DofusGuidePayloadError extends Error {
  readonly url: string;

  constructor(message: string, url: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DofusGuidePayloadError";
    this.url = url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGuideMetadata(value: unknown): value is GuideMetadata {
  return isRecord(value) && typeof value.id === "number" && typeof value.name === "string";
}

function isGuideElement(value: unknown): value is GuideElement {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.tuto_id === "number" &&
    typeof value.name === "string" &&
    typeof value.etape === "number" &&
    typeof value.type === "string" &&
    "valeur" in value
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export class DofusGuideClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly userAgent: string;

  private readonly fetchImpl: Fetch;
  private readonly sleepImpl: Sleep | undefined;
  private readonly logger: Pick<Console, "info" | "warn">;
  private readonly now: () => number;

  constructor(options: DofusGuideClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleepImpl = options.sleep;
    this.logger = options.logger ?? console;
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive integer");
    }
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new RangeError("maxRetries must be a non-negative integer");
    }
  }

  async getGuides(): Promise<GuideMetadata[]> {
    return (await this.getGuidesDocument()).data;
  }

  async getGuidesDocument(): Promise<RawJsonDocument<GuideMetadata[]>> {
    const url = `${new URL("/api/tutoriel/name", this.baseUrl).toString()}?dev`;
    return this.requestJson(url, (value): value is GuideMetadata[] => {
      return Array.isArray(value) && value.every(isGuideMetadata);
    });
  }

  async getGuideStep(guideId: number, step: number): Promise<GuideElement[]> {
    return (await this.getGuideStepDocument(guideId, step)).data;
  }

  async getGuideStepDocument(
    guideId: number,
    step: number,
  ): Promise<RawJsonDocument<GuideElement[]>> {
    if (!Number.isInteger(guideId)) {
      throw new RangeError("guideId must be an integer");
    }
    if (!Number.isInteger(step) || step < 1) {
      throw new RangeError("step must be a positive integer");
    }

    const url = new URL("/api/tutoriel", this.baseUrl);
    url.searchParams.set("id", String(guideId));
    url.searchParams.set("etape", String(step));

    return this.requestJson(url.toString(), (value): value is GuideElement[] => {
      return Array.isArray(value) && value.every(isGuideElement);
    });
  }

  private async requestJson<T>(
    url: string,
    validate: (value: unknown) => value is T,
  ): Promise<RawJsonDocument<T>> {
    return retry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          let response: Response;
          try {
            response = await this.fetchImpl(url, {
              headers: {
                accept: "application/json",
                "user-agent": this.userAgent,
              },
              signal: controller.signal,
            });
          } catch (error) {
            const reason = controller.signal.aborted
              ? `Request timed out after ${this.timeoutMs} ms`
              : `Network request failed: ${describeError(error)}`;
            throw new DofusGuideNetworkError(reason, url, { cause: error });
          }

          if (!response.ok) {
            const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), this.now());
            throw new DofusGuideHttpError(
              `GET ${url} returned HTTP ${response.status}`,
              response.status,
              url,
              retryAfterMs,
            );
          }

          const body = Buffer.from(await response.arrayBuffer());
          let data: unknown;
          try {
            data = JSON.parse(body.toString("utf8"));
          } catch (error) {
            throw new DofusGuidePayloadError(`GET ${url} returned invalid JSON`, url, {
              cause: error,
            });
          }

          if (!validate(data)) {
            throw new DofusGuidePayloadError(
              `GET ${url} returned an unexpected JSON payload`,
              url,
            );
          }

          this.logger.info(`[http] GET ${url} -> ${response.status}`);
          return { body, data };
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        maxRetries: this.maxRetries,
        shouldRetry: (error) => {
          return (
            error instanceof DofusGuideNetworkError ||
            (error instanceof DofusGuideHttpError && isRetryableStatus(error.status))
          );
        },
        getDelayMs: (error, _retryNumber, exponentialDelayMs) => {
          return error instanceof DofusGuideHttpError && error.retryAfterMs !== undefined
            ? Math.max(exponentialDelayMs, error.retryAfterMs)
            : exponentialDelayMs;
        },
        onRetry: (error, retryNumber, delayMs) => {
          this.logger.warn(
            `[http] ${describeError(error)}; retry ${retryNumber}/${this.maxRetries} in ${delayMs} ms`,
          );
        },
        ...(this.sleepImpl === undefined ? {} : { sleep: this.sleepImpl }),
      },
    );
  }
}

const defaultClient = new DofusGuideClient({
  ...(process.env.DOFUSGUIDE_BASE_URL === undefined
    ? {}
    : { baseUrl: process.env.DOFUSGUIDE_BASE_URL }),
  ...(process.env.DOFUSGUIDE_USER_AGENT === undefined
    ? {}
    : { userAgent: process.env.DOFUSGUIDE_USER_AGENT }),
});

export async function getGuides(): Promise<GuideMetadata[]> {
  return defaultClient.getGuides();
}

export async function getGuideStep(guideId: number, step: number): Promise<GuideElement[]> {
  return defaultClient.getGuideStep(guideId, step);
}
