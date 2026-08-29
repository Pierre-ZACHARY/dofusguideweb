import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { preserveScrapedAtIfUnchanged } from "../../src/utils/stableArchive.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("preserveScrapedAtIfUnchanged", () => {
  it("conserve le timestamp seulement lorsque le contenu est identique", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "stable-archive-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "archive.json");
    await writeFile(filePath, JSON.stringify({ scrapedAt: "2026-01-01T00:00:00.000Z", values: [1, 2] }));

    await expect(preserveScrapedAtIfUnchanged(filePath, {
      scrapedAt: "2026-02-01T00:00:00.000Z",
      values: [1, 2],
    })).resolves.toEqual({ scrapedAt: "2026-01-01T00:00:00.000Z", values: [1, 2] });

    await expect(preserveScrapedAtIfUnchanged(filePath, {
      scrapedAt: "2026-02-01T00:00:00.000Z",
      values: [1, 3],
    })).resolves.toEqual({ scrapedAt: "2026-02-01T00:00:00.000Z", values: [1, 3] });
    expect(await readFile(filePath, "utf8")).toContain("2026-01-01");
  });
});
