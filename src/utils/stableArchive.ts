import { readFile } from "node:fs/promises";

export interface TimestampedArchive {
  scrapedAt: string;
}

function withoutScrapedAt(value: Record<string, unknown>): Record<string, unknown> {
  const { scrapedAt: _scrapedAt, ...content } = value;
  return content;
}

/**
 * Keep the previous observation timestamp when the archived payload is
 * byte-for-byte equivalent apart from `scrapedAt`. This prevents scheduled
 * refreshes from creating data commits when a remote source did not change.
 */
export async function preserveScrapedAtIfUnchanged<T extends TimestampedArchive>(
  filePath: string,
  nextArchive: T,
): Promise<T> {
  let previous: unknown;
  try {
    previous = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return nextArchive;
    if (error instanceof SyntaxError) return nextArchive;
    throw error;
  }

  if (typeof previous !== "object" || previous === null || Array.isArray(previous)) {
    return nextArchive;
  }
  const previousRecord = previous as Record<string, unknown>;
  if (typeof previousRecord.scrapedAt !== "string") return nextArchive;

  const sameContent = JSON.stringify(withoutScrapedAt(previousRecord))
    === JSON.stringify(withoutScrapedAt(nextArchive as unknown as Record<string, unknown>));
  return sameContent
    ? { ...nextArchive, scrapedAt: previousRecord.scrapedAt }
    : nextArchive;
}
