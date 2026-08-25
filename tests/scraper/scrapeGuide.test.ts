import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatStepNumber,
  scrapeGuide,
  scrapeGuideStep,
} from "../../src/scraper/scrapeGuide.js";
import {
  readScrapeState,
  SCRAPE_STATE_VERSION,
  writeScrapeState,
  type ScrapeState,
} from "../../src/scraper/scrapeState.js";
import type { GuideElement } from "../../src/types/dofusGuide.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("formatStepNumber", () => {
  it("pads positive steps to at least four digits", () => {
    expect(formatStepNumber(1)).toBe("0001");
    expect(formatStepNumber(111)).toBe("0111");
    expect(formatStepNumber(10_000)).toBe("10000");
  });

  it("rejects invalid steps", () => {
    expect(() => formatStepNumber(0)).toThrow(RangeError);
    expect(() => formatStepNumber(1.5)).toThrow(RangeError);
  });
});

describe("scrapeGuideStep", () => {
  it("writes guide metadata and the untouched step response", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const guidesBody = Buffer.from(
      '[{"id":-1,"name":"Guide Principal (Mono/Multi)","autheur":"Magem"}]',
    );
    const stepBody = Buffer.from(
      '[ { "id": 1, "tuto_id": -1, "name": "Guide Principal (Mono/Multi)", "etape": 111, "type": "FUTURE_TYPE", "valeur": "untouched" } ]\r\n',
    );
    const client = {
      getGuidesDocument: vi.fn(async () => ({
        body: guidesBody,
        data: [{ id: -1, name: "Guide Principal (Mono/Multi)", autheur: "Magem" }],
      })),
      getGuideStepDocument: vi.fn(async () => ({
        body: stepBody,
        data: [
          {
            id: 1,
            tuto_id: -1,
            name: "Guide Principal (Mono/Multi)",
            etape: 111,
            type: "FUTURE_TYPE",
            valeur: "untouched",
          },
        ],
      })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await scrapeGuideStep({
      client,
      guideId: -1,
      step: 111,
      rawRoot,
      logger,
    });

    const guideRoot = path.join(rawRoot, "guides", "-1");
    expect((await readFile(path.join(rawRoot, "guides.json"))).equals(guidesBody)).toBe(true);
    expect(JSON.parse(await readFile(path.join(guideRoot, "metadata.json"), "utf8"))).toMatchObject({
      id: -1,
      name: "Guide Principal (Mono/Multi)",
      autheur: "Magem",
    });
    expect((await readFile(path.join(guideRoot, "steps", "0111.json"))).equals(stepBody)).toBe(
      true,
    );
    expect(result.elements).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith("Unknown guide element type: FUTURE_TYPE");
  });

  it("skips an existing one-step archive unless force or refresh is requested", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const stepsRoot = path.join(rawRoot, "guides", "-1", "steps");
    await mkdir(stepsRoot, { recursive: true });
    const existingBody = Buffer.from(
      '[{"id":1,"tuto_id":-1,"name":"Guide Principal","etape":111,"type":"TEXTE","valeur":"existing"}]',
    );
    await writeFile(path.join(stepsRoot, "0111.json"), existingBody);
    const client = {
      getGuidesDocument: vi.fn(async () => ({
        body: Buffer.from('[{"id":-1,"name":"Guide Principal"}]'),
        data: [{ id: -1, name: "Guide Principal" }],
      })),
      getGuideStepDocument: vi.fn(),
    };

    const result = await scrapeGuideStep({
      client,
      guideId: -1,
      step: 111,
      rawRoot,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(client.getGuideStepDocument).not.toHaveBeenCalled();
    expect(result.elements[0]?.valeur).toBe("existing");
    expect((await readFile(path.join(stepsRoot, "0111.json"))).equals(existingBody)).toBe(true);
  });

  it("archives a changed response and records hashes during refresh", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const guideRoot = path.join(rawRoot, "guides", "-1");
    const stepsRoot = path.join(guideRoot, "steps");
    await mkdir(stepsRoot, { recursive: true });
    const oldBody = Buffer.from(
      '[{"id":1,"tuto_id":-1,"name":"Guide Principal","etape":111,"type":"TEXTE","valeur":"old"}]',
    );
    const newBody = Buffer.from(
      '[{"id":1,"tuto_id":-1,"name":"Guide Principal","etape":111,"type":"TEXTE","valeur":"new"}]',
    );
    await writeFile(path.join(stepsRoot, "0111.json"), oldBody);
    const client = {
      getGuidesDocument: vi.fn(async () => ({
        body: Buffer.from('[{"id":-1,"name":"Guide Principal"}]'),
        data: [{ id: -1, name: "Guide Principal" }],
      })),
      getGuideStepDocument: vi.fn(async () => ({
        body: newBody,
        data: [
          {
            id: 1,
            tuto_id: -1,
            name: "Guide Principal",
            etape: 111,
            type: "TEXTE",
            valeur: "new",
          },
        ],
      })),
    };
    const detectedAt = new Date("2026-08-24T05:00:00.000Z");

    await scrapeGuideStep({
      client,
      guideId: -1,
      step: 111,
      refresh: true,
      rawRoot,
      now: () => detectedAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect((await readFile(path.join(stepsRoot, "0111.json"))).equals(newBody)).toBe(true);
    const journal = (await readFile(path.join(guideRoot, "changes.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      step: 111,
      detectedAt: detectedAt.toISOString(),
    });
    expect(journal[0]?.previousHash).not.toBe(journal[0]?.newHash);
    const archivedPath = String(journal[0]?.archivedPath);
    expect((await readFile(path.join(guideRoot, ...archivedPath.split("/")))).equals(oldBody)).toBe(
      true,
    );
  });

  it("refuses an id absent from the guide list before requesting a step", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const client = {
      getGuidesDocument: vi.fn(async () => ({
        body: Buffer.from("[]"),
        data: [],
      })),
      getGuideStepDocument: vi.fn(),
    };

    await expect(
      scrapeGuideStep({
        client,
        guideId: -1,
        step: 111,
        rawRoot,
        logger: { info: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow("Guide id=-1 was not found");
    expect(client.getGuideStepDocument).not.toHaveBeenCalled();
  });
});

describe("scrapeGuide", () => {
  function createSequentialClient(
    getStep: (step: number) => Promise<{ body: Buffer; data: GuideElement[] }>,
  ) {
    return {
      getGuidesDocument: vi.fn(async () => ({
        body: Buffer.from('[{"id":-1,"name":"Guide Principal (Mono/Multi)"}]'),
        data: [{ id: -1, name: "Guide Principal (Mono/Multi)" }],
      })),
      getGuideStepDocument: vi.fn(async (_guideId: number, step: number) => getStep(step)),
    };
  }

  it("downloads sequentially and stops after five consecutive empty steps", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const element = {
      id: 1,
      tuto_id: -1,
      name: "Guide Principal (Mono/Multi)",
      etape: 1,
      type: "TEXTE",
      valeur: "Start",
    };
    const client = createSequentialClient(async (step) => {
      const data = step === 1 ? [element] : [];
      return { body: Buffer.from(JSON.stringify(data)), data };
    });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await scrapeGuide({
      client,
      guideId: -1,
      rawRoot,
      sleep,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(client.getGuideStepDocument).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls).toEqual([[350], [350], [350], [350], [350]]);
    expect(result).toMatchObject({
      stepsDownloaded: 6,
      stepsSkipped: 0,
      emptyStepsEncountered: 5,
      elementsDownloaded: 1,
      lastProcessedStep: 6,
    });
    expect(await readScrapeState(path.join(rawRoot, "guides", "-1"))).toMatchObject({
      status: "completed",
      lastProcessedStep: 6,
      lastSuccessfulStep: 6,
      lastNonEmptyStep: 1,
      consecutiveEmptySteps: 5,
    });
    expect(
      JSON.parse(
        await readFile(path.join(rawRoot, "guides", "-1", "steps", "0006.json"), "utf8"),
      ),
    ).toEqual([]);
  });

  it("skips a valid existing file without requesting it again", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const stepsRoot = path.join(rawRoot, "guides", "-1", "steps");
    await mkdir(stepsRoot, { recursive: true });
    await writeFile(
      path.join(stepsRoot, "0001.json"),
      JSON.stringify([
        {
          id: 1,
          tuto_id: -1,
          name: "Guide Principal (Mono/Multi)",
          etape: 1,
          type: "TEXTE",
          valeur: "Existing",
        },
      ]),
    );
    const client = createSequentialClient(async () => ({ body: Buffer.from("[]"), data: [] }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await scrapeGuide({
      client,
      guideId: -1,
      rawRoot,
      sleep,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(client.getGuideStepDocument).toHaveBeenCalledTimes(5);
    expect(client.getGuideStepDocument.mock.calls[0]?.[1]).toBe(2);
    expect(result.stepsSkipped).toBe(1);
    expect(result.stepsDownloaded).toBe(5);
  });

  it("stops on a request error without treating it as an empty step", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const client = createSequentialClient(async () => {
      throw new Error("network exhausted");
    });

    await expect(
      scrapeGuide({
        client,
        guideId: -1,
        rawRoot,
        logger: { info: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow("network exhausted");
    expect(client.getGuideStepDocument).toHaveBeenCalledTimes(1);
    expect(await readScrapeState(path.join(rawRoot, "guides", "-1"))).toMatchObject({
      status: "running",
      lastProcessedStep: 0,
      consecutiveEmptySteps: 0,
    });
  });

  it("resumes after the last processed step and restores the empty counter", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const guideRoot = path.join(rawRoot, "guides", "-1");
    await mkdir(guideRoot, { recursive: true });
    await writeFile(
      path.join(rawRoot, "guides.json"),
      '[{"id":-1,"name":"Guide Principal (Mono/Multi)"}]',
    );
    const previousState: ScrapeState = {
      version: SCRAPE_STATE_VERSION,
      guideId: -1,
      guideName: "Guide Principal (Mono/Multi)",
      lastProcessedStep: 10,
      lastSuccessfulStep: 10,
      lastNonEmptyStep: 8,
      consecutiveEmptySteps: 2,
      stopAfterEmpty: 5,
      delayMs: 123,
      status: "running",
      updatedAt: "2026-08-24T05:00:00.000Z",
    };
    await writeScrapeState(guideRoot, previousState);
    const client = createSequentialClient(async () => ({ body: Buffer.from("[]"), data: [] }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await scrapeGuide({
      client,
      guideId: -1,
      rawRoot,
      resume: true,
      sleep,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(client.getGuidesDocument).not.toHaveBeenCalled();
    expect(client.getGuideStepDocument.mock.calls.map((call) => call[1])).toEqual([11, 12, 13]);
    expect(sleep.mock.calls).toEqual([[123], [123]]);
    expect(result.lastProcessedStep).toBe(13);
    expect(await readScrapeState(guideRoot)).toMatchObject({
      status: "completed",
      lastProcessedStep: 13,
      consecutiveEmptySteps: 5,
    });
  });

  it("does not make HTTP requests when a resumed state is already complete", async () => {
    const rawRoot = await mkdtemp(path.join(tmpdir(), "dofusguide-scraper-"));
    temporaryDirectories.push(rawRoot);
    const guideRoot = path.join(rawRoot, "guides", "-1");
    await mkdir(guideRoot, { recursive: true });
    await writeFile(
      path.join(rawRoot, "guides.json"),
      '[{"id":-1,"name":"Guide Principal (Mono/Multi)"}]',
    );
    await writeScrapeState(guideRoot, {
      version: SCRAPE_STATE_VERSION,
      guideId: -1,
      guideName: "Guide Principal (Mono/Multi)",
      lastProcessedStep: 331,
      lastSuccessfulStep: 331,
      lastNonEmptyStep: 326,
      consecutiveEmptySteps: 5,
      stopAfterEmpty: 5,
      delayMs: 350,
      status: "completed",
      updatedAt: "2026-08-24T05:00:00.000Z",
    });
    const client = createSequentialClient(async () => {
      throw new Error("must not be called");
    });

    const result = await scrapeGuide({
      client,
      guideId: -1,
      rawRoot,
      resume: true,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(client.getGuidesDocument).not.toHaveBeenCalled();
    expect(client.getGuideStepDocument).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stepsDownloaded: 0,
      stepsSkipped: 0,
      lastProcessedStep: 331,
    });
  });
});
