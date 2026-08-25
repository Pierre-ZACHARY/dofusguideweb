import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/server.js";
import { createQueryDatabase } from "../helpers/queryDatabase.js";

describe("DofusGuide API", () => {
  let root: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dofusguide-api-"));
    app = buildApi({ databasePath: await createQueryDatabase(root) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it("liste les guides", async () => {
    const response = await app.inject({ method: "GET", url: "/guides" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { id: -1, name: "Guide Principal (Mono/Multi)", raw: { extra: true } },
      { id: 2, name: "Guide secondaire" },
    ]);
  });

  it("retourne le detail d'une etape avec elements et quetes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/guides/-1/steps/111",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      stepNumber: 111,
      elements: [{ remoteId: 15851, rawElement: { unknown: "preserved" } }],
      quests: [
        { questKey: "quest:132", relationType: "ACTIVE" },
        { questKey: "quest:133", relationType: "START" },
      ],
    });
  });

  it("recherche et pagine les quetes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/quests?q=Bouc%20%C3%A0%20mis%C3%A8re&limit=1&offset=0",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      limit: 1,
      offset: 0,
      items: [{ questKey: "quest:132" }],
    });
  });

  it("combine categorie, guide et plage d'etapes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/quests?type=ali&guideId=-1&stepMin=100&stepMax=111",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { questKey: string }) => item.questKey)).toEqual([
      "quest:132",
      "quest:133",
    ]);
  });

  it("retourne le detail et les etapes d'une quete", async () => {
    const detail = await app.inject({
      method: "GET",
      url: "/quests/quest%3A132",
    });
    const steps = await app.inject({
      method: "GET",
      url: "/quests/quest%3A132/steps",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      questKey: "quest:132",
      originalName: "47. Bouc à misère",
    });
    expect(steps.statusCode).toBe(200);
    expect(steps.json()).toEqual([
      {
        guideId: -1,
        guideName: "Guide Principal (Mono/Multi)",
        stepNumber: 111,
        stepTitle: "8. Affaires de fromage",
        relationType: "ACTIVE",
        sortOrder: 0,
      },
    ]);
  });

  it.each([
    "/quests?limit=201",
    "/quests?offset=-1",
    "/quests?stepMin=120&stepMax=100",
    "/guides/not-an-id/steps/111",
    "/guides/-1/steps/0",
  ])("retourne 400 pour %s", async (url) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Bad Request" });
  });

  it.each([
    "/guides/-1/steps/999",
    "/quests/quest%3Amissing",
    "/quests/quest%3Amissing/steps",
  ])("retourne 404 pour %s", async (url) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Not Found" });
  });

  it("refuse une base absente", () => {
    expect(() =>
      buildApi({ databasePath: path.join(root, "missing.sqlite") }),
    ).toThrow("Database not found");
  });
});
