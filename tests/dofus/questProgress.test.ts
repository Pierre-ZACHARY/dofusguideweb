import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { firstTaggedQuestAppearances, groupTaggedQuestCompletions, sortDofusByLevelAndAppearance } from "../../src/dofus/questProgress.js";
import { DOFUS_TAG_DEFINITIONS } from "../../src/dofus/tagDefinitions.js";
import { loadResolvedDofus } from "../../src/dofus/resolveDofus.js";
import type { DofusDbItemArchive } from "../../src/dofus/types.js";
import { SqliteDofusGuideRepository } from "../../src/repositories/sqliteDofusGuideRepository.js";

describe("Dofus quest progress", () => {
  it("déduplique une quête, accepte plusieurs tags et privilégie FINISH pour l’étape d’achèvement", () => {
    const grouped = groupTaggedQuestCompletions([
      { questKey: "quest:1", stepNumber: 2, relationType: "START", rawValue: { dofus_quest: ["DDG", "nébuleux"] } },
      { questKey: "quest:1", stepNumber: 8, relationType: "ACTIVE", rawValue: { dofus_quest: ["DDG", "nébuleux"] } },
      { questKey: "quest:1", stepNumber: 12, relationType: "FINISH", rawValue: { dofus_quest: ["DDG", "nébuleux"] } },
    ]);
    expect(grouped.get("DDG")).toEqual([{ questKey: "quest:1", completionStep: 12 }]);
    expect(grouped.get("nébuleux")).toEqual([{ questKey: "quest:1", completionStep: 12 }]);
  });

  it("associe les variantes de quêtes d’alignement au parcours Ivoire", () => {
    const grouped = groupTaggedQuestCompletions([
      { questKey: "quest:ali", stepNumber: 36, relationType: "ACTIVE", rawValue: { type: "ALI", dofus_quest: [] } },
      { questKey: "quest:ali-finish", stepNumber: 38, relationType: "FINISH", rawValue: { type: "ALI_FINISH", dofus_quest: [] } },
    ]);
    expect(grouped.get("ivoire")).toEqual([
      { questKey: "quest:ali", completionStep: 36 },
      { questKey: "quest:ali-finish", completionStep: 38 },
    ]);
  });

  it("retrouve les 16 tags et les nombres de quêtes uniques des données réelles", () => {
    const repository = new SqliteDofusGuideRepository("data/dofusguide.sqlite");
    try {
      const grouped = groupTaggedQuestCompletions(repository.listGuideQuestOccurrences(-1));
      expect(grouped.size).toBe(16);
      expect(grouped.get("argenté")).toHaveLength(55);
      expect(grouped.get("DDG")).toHaveLength(69);
      expect(grouped.get("ivoire")).toHaveLength(140);
      expect(grouped.get("nébuleux")).toHaveLength(87);
      expect(grouped.get("turquoise")).toHaveLength(1);
    } finally {
      repository.close();
    }
  });

  it("dispose d’une fiche locale pour chaque correspondance explicite", async () => {
    const archive = JSON.parse(await readFile("data/dofusdb/dofus.json", "utf8")) as DofusDbItemArchive;
    expect(archive.total).toBe(34);
    for (const definition of DOFUS_TAG_DEFINITIONS) {
      expect(archive.items.some((item) => item.id === definition.itemId), definition.tag).toBe(true);
    }
  });

  it("ordonne les parcours par niveau de Dofus croissant", async () => {
    const resolved = await loadResolvedDofus();
    expect(resolved[0]).toMatchObject({ name: "Dofus Argenté", level: 20 });
    expect(resolved.find((item) => item.tag === "vulbis")).toMatchObject({ itemId: 6980, name: "Dofus Vulbis", level: 180 });
    expect(resolved.map((item) => item.level)).toEqual([...resolved.map((item) => item.level)].sort((left, right) => (left ?? Infinity) - (right ?? Infinity)));
  });

  it("départage les Dofus de même niveau par leur première apparition dans le guide", () => {
    const occurrences = [
      { questKey: "quest:vulbis", stepNumber: 100, relationType: "START", rawValue: { dofus_quest: ["vulbis"] } },
      { questKey: "quest:nebuleux", stepNumber: 150, relationType: "START", rawValue: { dofus_quest: ["nébuleux"] } },
    ];
    const sorted = sortDofusByLevelAndAppearance([
      { tag: "nébuleux", name: "Dofus Nébuleux", level: 200 },
      { tag: "vulbis", name: "Dofus Vulbis", level: 200 },
      { tag: "pourpre", name: "Dofus Pourpre", level: 130 },
    ], firstTaggedQuestAppearances(occurrences));
    expect(sorted.map((item) => item.tag)).toEqual(["pourpre", "vulbis", "nébuleux"]);
  });
});
