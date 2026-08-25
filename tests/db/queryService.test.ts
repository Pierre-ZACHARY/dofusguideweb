import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { QueryService } from "../../src/db/queryService.js";
import { createQueryDatabase } from "../helpers/queryDatabase.js";

const directories: string[] = [];

async function fixture(): Promise<{ root: string; service: QueryService }> {
  const root = await mkdtemp(path.join(tmpdir(), "dofusguide-query-"));
  directories.push(root);
  return { root, service: new QueryService(await createQueryDatabase(root)) };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("QueryService", () => {
  it("liste les guides et decode le detail d'une etape", async () => {
    const { service } = await fixture();
    try {
      expect(service.listGuides().map(({ id }) => id)).toEqual([-1, 2]);
      const step = service.getGuideStep(-1, 111);
      expect(step).toMatchObject({
        guideId: -1,
        stepNumber: 111,
        title: "8. Affaires de fromage",
        raw: [{ type: "TEXTE", valeur: "8. Affaires de fromage" }],
      });
      expect(step?.elements[0]).toMatchObject({
        remoteId: 15851,
        elementType: "TEXTE",
        rawElement: { unknown: "preserved" },
      });
      expect(step?.quests.map(({ questKey, relationType }) => ({
        questKey,
        relationType,
      }))).toEqual([
        { questKey: "quest:132", relationType: "ACTIVE" },
        { questKey: "quest:133", relationType: "START" },
      ]);
      expect(service.getGuideStep(-1, 999)).toBeUndefined();
    } finally {
      service.close();
    }
  });

  it("recherche par nom accentue et categorie sans tenir compte de la casse", async () => {
    const { service } = await fixture();
    try {
      const named = service.searchQuests({ q: "Bouc à misère" });
      expect(named.total).toBe(1);
      expect(named.items[0]).toMatchObject({
        questKey: "quest:132",
        normalizedName: "bouc a misere",
        rawValue: { custom: true },
      });
      const category = service.searchQuests({ type: "ali" });
      expect(category.items.map(({ questKey }) => questKey)).toEqual([
        "quest:132",
        "quest:133",
      ]);
    } finally {
      service.close();
    }
  });

  it("filtre par guide et plage d'etapes avec une pagination stable", async () => {
    const { service } = await fixture();
    try {
      expect(
        service
          .searchQuests({ guideId: -1, stepMin: 110, stepMax: 115 })
          .items.map(({ questKey }) => questKey),
      ).toEqual(["quest:132", "quest:133"]);
      expect(
        service.searchQuests({ guideId: 2 }).items.map(({ questKey }) => questKey),
      ).toEqual(["quest:200"]);
      const page = service.searchQuests({ limit: 1, offset: 1 });
      expect(page).toMatchObject({ total: 3, limit: 1, offset: 1 });
      expect(page.items[0]?.questKey).toBe("quest:132");
    } finally {
      service.close();
    }
  });

  it("retourne une quete et ses apparitions ordonnees", async () => {
    const { service } = await fixture();
    try {
      expect(service.getQuest("quest:132")).toMatchObject({
        originalName: "47. Bouc à misère",
        startX: -32,
        startY: -57,
      });
      expect(service.getQuestSteps("quest:200")).toEqual([
        {
          guideId: -1,
          guideName: "Guide Principal (Mono/Multi)",
          stepNumber: 120,
          stepTitle: "Étape 120",
          relationType: "FINISH",
          sortOrder: 0,
        },
        {
          guideId: 2,
          guideName: "Guide secondaire",
          stepNumber: 10,
          stepTitle: "Étape secondaire",
          relationType: "ACTIVE",
          sortOrder: 0,
        },
      ]);
      expect(service.getQuest("quest:missing")).toBeUndefined();
      expect(service.getQuestSteps("quest:missing")).toBeUndefined();
    } finally {
      service.close();
    }
  });
});
