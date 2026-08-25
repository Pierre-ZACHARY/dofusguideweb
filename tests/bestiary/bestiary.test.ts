import { describe, expect, it } from "vitest";
import { buildBestiaryCatalog } from "../../src/bestiary/buildCatalog.js";
import { enrichQuestGuideBestiary, queryBestiaryZone } from "../../src/bestiary/resolveBestiary.js";
import type { QuestGuideContent } from "../../src/questGuides/types.js";

const catalog = buildBestiaryCatalog({
  source: "https://api.dofusdb.fr",
  scrapedAt: "2026-08-24T00:00:00.000Z",
  monsters: [
    { id: 463, name: { fr: "Fouduglen l'Écureuil" }, grades: [{ level: 20 }], subareas: [95], isBounty: true, img: "https://example.test/463.png" },
    { id: 2345, name: { fr: "Pioukas la Plante" }, grades: [{ level: 11 }], subareas: [10, 95], isMiniBoss: true },
    { id: 493, name: { fr: "Piou Jaune" }, grades: [{ level: 11 }], subareas: [10, 95] },
  ],
  dungeons: [{ id: 203, name: { fr: "Donjon test" }, minLevel: 20, bosses: [463], monsters: [493], subareaId: 10 }],
  achievements: [{
    id: 217,
    name: { fr: "Pious" },
    category: { parent: { id: 25, name: { fr: "Monstres" } } },
    objectives: [{ criterion: "PL&Ef>493,0" }],
  }],
  subareas: [
    { id: 10, name: { fr: "Village d'Amakna" }, monsters: [493, 2345] },
    { id: 95, name: { fr: "Cité d'Astrub" }, monsters: [463, 493, 2345] },
    { id: 96, name: { fr: "Carrière d'Astrub" }, monsters: [] },
    { id: 99, name: { fr: "Souterrains d'Astrub" }, monsters: [] },
    { id: 100, name: { fr: "Égouts d'Astrub" }, monsters: [] },
  ],
  mapPositions: [
    { id: 1, posX: -32, posY: -57, subAreaId: 95, worldMap: 1, hasPriorityOnWorldmap: true },
    { id: 2, posX: -32, posY: -57, subAreaId: 10, worldMap: 2 },
    { id: 3, posX: 7, posY: -19, subAreaId: 95, worldMap: 1, hasPriorityOnWorldmap: true },
    { id: 4, posX: 9, posY: -19, subAreaId: 96, worldMap: 1, hasPriorityOnWorldmap: true },
    { id: 5, posX: 5, posY: -17, subAreaId: 95, worldMap: 1, hasPriorityOnWorldmap: true },
  ],
});

const content: QuestGuideContent = {
  overview: "Test", recommendedLevel: 20, prerequisites: [], rewards: [], preparation: [],
  actions: [{ instruction: "Parlez au PNJ en [-32,-57].", position: "[-32,-57]", zoneHint: "Cité d'Astrub", warning: null, combat: "NONE" }],
  notes: [], npcs: [], items: [],
};

describe("bestiary catalog", () => {
  it("classe les monstres et indexe la zone prioritaire d'une coordonnée", () => {
    expect(catalog.monsters.find((monster) => monster.id === 2345)).toMatchObject({ level: 11, isArchmonster: true, isBounty: false });
    expect(catalog.coordinates["-32,-57"]).toEqual([95, 10]);
    expect(queryBestiaryZone(catalog, "cite astrub").monsters.map((monster) => monster.id)).toEqual([463, 493, 2345]);
  });

  it("fige zones, avis, archimonstres et succès dans le résumé", () => {
    const enriched = enrichQuestGuideBestiary(content, catalog);
    expect(enriched.zones).toEqual([{ id: 95, name: "Cité d'Astrub", coordinates: ["-32,-57"] }]);
    expect(enriched.bounties.map((monster) => monster.id)).toEqual([463]);
    expect(enriched.archmonsters.map((monster) => monster.id)).toEqual([2345]);
    expect(enriched.achievements).toMatchObject([{ id: 217, name: "Pious", monsters: [{ id: 493 }] }]);
  });

  it("sélectionne une sous-zone moins prioritaire lorsqu'elle est explicitement nommée", () => {
    const village = enrichQuestGuideBestiary({
      ...content,
      actions: [{ ...content.actions[0]!, zoneHint: "Village d’Amakna" }],
    }, catalog);
    expect(village.zones).toEqual([{ id: 10, name: "Village d'Amakna", coordinates: ["-32,-57"] }]);
    const fallback = enrichQuestGuideBestiary({
      ...content,
      actions: [{ ...content.actions[0]!, zoneHint: null, instruction: "Parlez au PNJ." }],
    }, catalog);
    expect(fallback.zones[0]?.id).toBe(95);
  });

  it("sélectionne une sous-zone intérieure nommée absente de l'index de l'entrée extérieure", () => {
    const sewers = enrichQuestGuideBestiary({
      ...content,
      actions: [{ ...content.actions[0]!, zoneHint: "Égouts d'Astrub", position: "[5,-17]", instruction: "Entrez dans les égouts." }],
    }, catalog);
    expect(catalog.coordinates["5,-17"]).toEqual([95]);
    expect(sewers.zones).toEqual([{ id: 100, name: "Égouts d'Astrub", coordinates: ["5,-17"] }]);
  });

  it("conserve toutes les sous-zones successives d'une quête", () => {
    const journey = enrichQuestGuideBestiary({
      ...content,
      actions: [
        { ...content.actions[0]!, instruction: "Parlez à Prim.", position: "[7,-19]", zoneHint: "Cité d'Astrub" },
        { ...content.actions[0]!, instruction: "Récoltez la limaille.", position: "[9,-19]", zoneHint: "Carrière d'Astrub" },
        { ...content.actions[0]!, instruction: "Combattez les Milirats.", position: "[5,-17]", zoneHint: "Égouts d'Astrub" },
      ],
    }, catalog);
    expect(journey.zones).toEqual([
      { id: 96, name: "Carrière d'Astrub", coordinates: ["9,-19"] },
      { id: 95, name: "Cité d'Astrub", coordinates: ["7,-19"] },
      { id: 100, name: "Égouts d'Astrub", coordinates: ["5,-17"] },
    ]);
  });

  it("ne duplique pas une zone générique lorsque les coordonnées identifient une zone plus précise", () => {
    const forest = enrichQuestGuideBestiary({
      ...content,
      actions: [{ ...content.actions[0]!, instruction: "Combattez dans la forêt.", position: "[7,-19]", zoneHint: "Astrub" }],
    }, catalog);
    expect(forest.zones).toEqual([{ id: 95, name: "Cité d'Astrub", coordinates: ["7,-19"] }]);
  });
});
