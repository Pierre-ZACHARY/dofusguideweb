import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveStep } from "../../src/scraper/changeTracking.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("saveStep", () => {
  it("does not rewrite or journal an unchanged refresh response", async () => {
    const guideRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(guideRoot);
    const filePath = path.join(guideRoot, "steps", "0111.json");
    const body = Buffer.from('[{"same":true}]\n');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);

    const status = await saveStep({
      filePath,
      guideRoot,
      step: 111,
      body,
      trackExistingChanges: true,
      detectedAt: "2026-08-24T05:00:00.000Z",
    });

    expect(status).toBe("unchanged");
    expect((await readFile(filePath)).equals(body)).toBe(true);
    await expect(readFile(path.join(guideRoot, "changes.jsonl"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
