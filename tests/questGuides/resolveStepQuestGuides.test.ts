import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadQuestGuideStepArchive, questGuideStepPath } from "../../src/questGuides/resolveQuestGuides.js";
import { atomicWriteFile } from "../../src/utils/fs.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("step quest guide storage", () => {
  it("charge le fichier correspondant exactement au guide et à l'étape", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dofusguide-step-summaries-"));
    temporaryDirectories.push(root);
    const filePath = questGuideStepPath(-1, 42, root);
    await atomicWriteFile(filePath, Buffer.from(JSON.stringify({
      version: 2,
      guideId: -1,
      stepNumber: 42,
      updatedAt: null,
      summaries: [],
      tips: [],
    }), "utf8"));

    await expect(loadQuestGuideStepArchive(-1, 42, root)).resolves.toMatchObject({ guideId: -1, stepNumber: 42 });
    await expect(loadQuestGuideStepArchive(-1, 43, root)).resolves.toBeNull();
  });
});
