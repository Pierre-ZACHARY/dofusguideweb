import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { importRawDatabase } from "../../src/db/importRaw.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dofusguide-db-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createArchive(root: string): Promise<{
  rawDirectory: string;
  stepOnePath: string;
  stepOneRaw: string;
}> {
  const rawDirectory = path.join(root, "raw");
  const guideDirectory = path.join(rawDirectory, "guides", "-1");
  const stepsDirectory = path.join(guideDirectory, "steps");
  await mkdir(stepsDirectory, { recursive: true });

  const metadata = {
    id: -1,
    name: "Guide Principal (Mono/Multi)",
    autheur: "Magem",
    image: "https://example.test/guide.png",
    updated_at: "2025-09-17T17:37:31.000Z",
    unknown_metadata: { preserved: true },
  };
  const stepOne = [
    {
      id: 10,
      tuto_id: -1,
      name: metadata.name,
      etape: 1,
      type: "TEXTE",
      valeur: "  1. Commencement  ",
      pos: { pos_x: "1", pos_y: "2", largeur: 300, hauteur: 40 },
    },
    {
      id: 11,
      tuto_id: -1,
      name: metadata.name,
      etape: 1,
      type: "QUEST_START",
      valeur: {
        id: "quest_start:1",
        name: "1. Départ héroïque",
        type: "TDM",
        name_pnj: "Premier PNJ",
        position_start: {
          cmd: "/travel 1,2",
          map: "AMAKNA",
          position: "[1,2]",
        },
        unknown_quest_field: true,
      },
    },
    {
      id: 12,
      tuto_id: -1,
      name: metadata.name,
      etape: 1,
      type: "FUTURE_TYPE",
      valeur: { preserved: true },
    },
  ];
  const stepTwo = [
    {
      id: 20,
      tuto_id: -1,
      name: metadata.name,
      etape: 2,
      type: "QUEST",
      valeur: {
        id: "quest:1",
        type: "QUEST",
        name_pnj: "Dernier PNJ",
        link: "https://example.test/quest-1",
      },
    },
    {
      id: 21,
      tuto_id: -1,
      name: metadata.name,
      etape: 2,
      type: "QUEST_FINISH",
      valeur: {
        id: "quest:2",
        name: "2. Une autre quête",
      },
    },
  ];
  const stepOneRaw = JSON.stringify(stepOne, null, 2) + "\n";
  const stepOnePath = path.join(stepsDirectory, "0001.json");

  await writeFile(path.join(guideDirectory, "metadata.json"), JSON.stringify(metadata, null, 2));
  await writeFile(
    path.join(guideDirectory, "scrape-state.json"),
    JSON.stringify({ updatedAt: "2026-08-24T05:00:00.000Z" }),
  );
  await writeFile(stepOnePath, stepOneRaw);
  await writeFile(path.join(stepsDirectory, "0002.json"), JSON.stringify(stepTwo));
  await writeFile(path.join(stepsDirectory, "0003.json"), "[]");

  return { rawDirectory, stepOnePath, stepOneRaw };
}

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("importRawDatabase", () => {
  it("reconstruit le schema minimal et conserve les JSON complets", async () => {
    const root = await temporaryDirectory();
    const fixture = await createArchive(root);
    const databasePath = path.join(root, "dofusguide.sqlite");
    const archiveHashBefore = sha256(await readFile(fixture.stepOnePath));

    const result = await importRawDatabase({
      rawDirectory: fixture.rawDirectory,
      databasePath,
      migrationsDirectory: path.resolve("drizzle"),
    });

    expect(result).toEqual({
      databasePath,
      guidesImported: 1,
      stepsImported: 3,
      elementsImported: 5,
      questsImported: 2,
      questOccurrencesImported: 3,
    });
    expect(sha256(await readFile(fixture.stepOnePath))).toBe(archiveHashBefore);

    const database = new Database(databasePath);
    try {
      expect(
        database.prepare("SELECT count(*) AS count FROM schema_migrations").get(),
      ).toMatchObject({ count: 2 });
      expect(database.prepare("SELECT count(*) AS count FROM guide_steps").get()).toMatchObject({
        count: 3,
      });
      expect(database.prepare("SELECT count(*) AS count FROM guide_chapters").get()).toMatchObject({ count: 1 });
      expect(database.prepare("SELECT chapter_number AS chapterNumber, name, start_step AS startStep FROM guide_chapters").get()).toEqual({ chapterNumber: 1, name: "Commencement", startStep: 1 });
      expect(
        database.prepare("SELECT count(*) AS count FROM guide_elements").get(),
      ).toMatchObject({ count: 5 });
      expect(
        database
          .prepare(
            `SELECT raw_json AS rawJson, title
             FROM guide_steps WHERE guide_id = -1 AND step_number = 1`,
          )
          .get(),
      ).toEqual({ rawJson: fixture.stepOneRaw, title: "1. Commencement" });
      expect(
        database
          .prepare(
            `SELECT element_type AS elementType, raw_element_json AS rawElementJson
             FROM guide_elements WHERE remote_id = 12`,
          )
          .get(),
      ).toMatchObject({
        elementType: "FUTURE_TYPE",
        rawElementJson: expect.stringContaining('"preserved":true'),
      });

      const mergedQuest = database
        .prepare(
          `SELECT quest_key AS questKey, source_quest_key AS sourceQuestKey,
                  original_name AS originalName, normalized_name AS normalizedName,
                  category, npc_name AS npcName, external_url AS externalUrl,
                  start_x AS startX, start_y AS startY
           FROM quests WHERE quest_key = 'quest:1'`,
        )
        .get();
      expect(mergedQuest).toEqual({
        questKey: "quest:1",
        sourceQuestKey: "quest:1",
        originalName: "1. Départ héroïque",
        normalizedName: "depart heroique",
        category: "QUEST",
        npcName: "Dernier PNJ",
        externalUrl: "https://example.test/quest-1",
        startX: 1,
        startY: 2,
      });
      expect(
        database
          .prepare(
            `SELECT count(*) AS count
             FROM quests WHERE normalized_name LIKE '%autre quete%'`,
          )
          .get(),
      ).toMatchObject({ count: 1 });
      expect(
        database
          .prepare(
            `SELECT group_concat(gs.step_number, ',') AS steps
             FROM guide_step_quests gs
             JOIN quests q ON q.id = gs.quest_id
             WHERE q.quest_key = 'quest:1' AND gs.step_number BETWEEN 1 AND 2`,
          )
          .get(),
      ).toMatchObject({ steps: "1,2" });
      expect(() =>
        database
          .prepare(
            `INSERT INTO guide_steps
             (guide_id, step_number, raw_json) VALUES (-1, 1, '[]')`,
          )
          .run(),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it("peut reconstruire et remplacer une base existante", async () => {
    const root = await temporaryDirectory();
    const fixture = await createArchive(root);
    const databasePath = path.join(root, "dofusguide.sqlite");
    const options = {
      rawDirectory: fixture.rawDirectory,
      databasePath,
      migrationsDirectory: path.resolve("drizzle"),
    };

    await importRawDatabase(options);
    await importRawDatabase(options);

    const database = new Database(databasePath, { readonly: true });
    try {
      expect(database.prepare("SELECT count(*) AS count FROM quests").get()).toMatchObject({
        count: 2,
      });
    } finally {
      database.close();
    }
    const leftovers = (await readdir(root)).filter(
      (name) => name.includes(".tmp") || name.endsWith(".backup"),
    );
    expect(leftovers).toEqual([]);
  });

  it("laisse la base existante intacte si une archive est invalide", async () => {
    const root = await temporaryDirectory();
    const fixture = await createArchive(root);
    const databasePath = path.join(root, "dofusguide.sqlite");
    const marker = Buffer.from("existing database marker");
    await writeFile(databasePath, marker);
    await writeFile(fixture.stepOnePath, "{invalid json");

    await expect(
      importRawDatabase({
        rawDirectory: fixture.rawDirectory,
        databasePath,
        migrationsDirectory: path.resolve("drizzle"),
      }),
    ).rejects.toThrow("Invalid JSON");
    expect(await readFile(databasePath)).toEqual(marker);
  });

  it("laisse la base existante intacte si une migration echoue", async () => {
    const root = await temporaryDirectory();
    const fixture = await createArchive(root);
    const databasePath = path.join(root, "dofusguide.sqlite");
    const migrationsDirectory = path.join(root, "broken-migrations");
    const marker = Buffer.from("existing database marker");
    await mkdir(migrationsDirectory);
    await writeFile(path.join(migrationsDirectory, "0001_broken.sql"), "THIS IS NOT SQL;");
    await writeFile(databasePath, marker);

    await expect(
      importRawDatabase({
        rawDirectory: fixture.rawDirectory,
        databasePath,
        migrationsDirectory,
      }),
    ).rejects.toThrow();
    expect(await readFile(databasePath)).toEqual(marker);
  });
});
