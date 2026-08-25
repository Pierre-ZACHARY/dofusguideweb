import { describe, expect, it } from "vitest";

import { normalizeGuideStep } from "../../src/normalizer/guideStep.js";
import type { GuideElement } from "../../src/types/dofusGuide.js";

describe("normalizeGuideStep", () => {
  it("normalise une etape sans modifier ni filtrer les elements bruts", () => {
    const elements = [
      {
        id: 1,
        tuto_id: -1,
        name: "Guide Principal (Mono/Multi)",
        etape: 111,
        type: "TEXTE",
        valeur: "  8. Affaires de fromage  ",
        pos: { pos_x: "12", pos_y: "-4", largeur: "320", hauteur: 50 },
      },
      {
        id: 2,
        tuto_id: -1,
        name: "Guide Principal (Mono/Multi)",
        etape: 111,
        type: "TYPE_INCONNU",
        valeur: { futur: true },
        pos: { pos_x: 5, pos_y: 6 },
      },
    ] as unknown as GuideElement[];
    const before = JSON.stringify(elements);

    const normalized = normalizeGuideStep(-1, 111, elements);

    expect(normalized).toMatchObject({
      guideId: -1,
      stepNumber: 111,
      title: "8. Affaires de fromage",
      recommendedLevelMin: null,
      recommendedLevelMax: null,
    });
    expect(normalized.elements).toHaveLength(2);
    expect(normalized.elements[0]).toMatchObject({
      remoteId: 1,
      sortOrder: 0,
      elementType: "TEXTE",
      positionX: 12,
      positionY: -4,
      width: 320,
      height: 50,
    });
    expect(normalized.elements[1]?.elementType).toBe("TYPE_INCONNU");
    expect(normalized.elements[0]?.rawElement).toBe(elements[0]);
    expect(normalized.elements[1]?.rawValue).toBe(elements[1]?.valeur);
    expect(JSON.stringify(elements)).toBe(before);
  });

  it("conserve un ordre global stable pour les relations de quetes", () => {
    const elements = [
      {
        id: 10,
        tuto_id: -1,
        name: "Guide",
        etape: 5,
        type: "QUEST_START",
        valeur: [
          { id: "quest_start:1", name: "1. Première" },
          { id: "quest_start:2", name: "2. Seconde" },
        ],
      },
      {
        id: 11,
        tuto_id: -1,
        name: "Guide",
        etape: 5,
        type: "QUEST",
        valeur: { id: "quest:3", name: "3. Troisième" },
      },
    ] as GuideElement[];

    const normalized = normalizeGuideStep(-1, 5, elements);

    expect(normalized.quests.map(({ quest }) => quest.questKey)).toEqual([
      "quest:1",
      "quest:2",
      "quest:3",
    ]);
    expect(normalized.quests.map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2]);
    expect(normalized.quests.map(({ sourceElementOrder }) => sourceElementOrder)).toEqual([
      0,
      0,
      1,
    ]);
  });
});
