import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeGuides } from "../../src/scraper/scrapeGuides.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("scrapeGuides", () => {
  it("writes the original response without reformatting it", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(directory);
    const outputFile = path.join(directory, "nested", "guides.json");
    const raw = Buffer.from('[ { "id": -1, "name": "Guide Principal (Mono/Multi)" } ]\r\n');
    const client = {
      getGuidesDocument: vi.fn(async () => ({
        body: raw,
        data: [{ id: -1, name: "Guide Principal (Mono/Multi)" }],
      })),
    };

    const guides = await scrapeGuides({
      client,
      outputFile,
      logger: { info: vi.fn() },
    });

    expect(guides).toEqual([{ id: -1, name: "Guide Principal (Mono/Multi)" }]);
    expect((await readFile(outputFile)).equals(raw)).toBe(true);
  });

  it("atomically replaces an existing archive", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(directory);
    const outputFile = path.join(directory, "guides.json");
    const firstBody = Buffer.from('[{"id":1,"name":"First"}]');
    const secondBody = Buffer.from('[ { "id": 2, "name": "Second" } ]\n');
    const getGuidesDocument = vi
      .fn()
      .mockResolvedValueOnce({ body: firstBody, data: [{ id: 1, name: "First" }] })
      .mockResolvedValueOnce({ body: secondBody, data: [{ id: 2, name: "Second" }] });
    const options = {
      client: { getGuidesDocument },
      outputFile,
      logger: { info: vi.fn() },
    };

    await scrapeGuides(options);
    await scrapeGuides(options);

    expect((await readFile(outputFile)).equals(secondBody)).toBe(true);
  });
});
