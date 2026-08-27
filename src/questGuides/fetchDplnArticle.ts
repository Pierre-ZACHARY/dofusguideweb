import { retry } from "../utils/retry.js";
import { extractDplnArticle, type ExtractedQuestArticle } from "./extractDplnArticle.js";

class SourceHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super("GET " + url + " returned HTTP " + status);
  }
}

export function assertAllowedDplnSource(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "www.dofuspourlesnoobs.com" || !url.pathname.endsWith(".html")) {
    throw new Error("Unsupported quest guide source: " + rawUrl);
  }
  url.hash = "";
  url.search = "";
  return url;
}

export async function fetchDplnArticle(rawUrl: string, requestFetch: typeof fetch = fetch): Promise<ExtractedQuestArticle> {
  const url = assertAllowedDplnSource(rawUrl);
  const response = await retry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await requestFetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "DofusGuideScraper/0.1.0 (local prompt source collector; one request per quest guide)",
        },
        signal: controller.signal,
      });
      if (!result.ok) throw new SourceHttpError(result.status, url.toString());
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }, {
    maxRetries: 3,
    shouldRetry: (error) => !(error instanceof SourceHttpError) || error.status === 408 || error.status === 429 || error.status >= 500,
    onRetry: (_error, retryNumber, delayMs) => console.warn("[dpln] retry " + retryNumber + " in " + delayMs + " ms"),
  });
  return extractDplnArticle(await response.text(), url.toString());
}
