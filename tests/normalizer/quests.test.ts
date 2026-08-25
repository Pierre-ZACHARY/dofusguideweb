import { describe, expect, it } from "vitest";

import {
  extractQuestOccurrences,
  relationTypeForElement,
} from "../../src/normalizer/quests.js";
import type { GuideElement } from "../../src/types/dofusGuide.js";

function questElement(type: string, valeur: unknown, id = 15851): GuideElement {
  return {
    id,
    tuto_id: -1,
    name: "Guide Principal (Mono/Multi)",
    etape: 111,
    type,
    valeur,
  };
}

describe("relationTypeForElement", () => {
  it.each([
    ["QUEST_START", "START"],
    ["QUEST", "ACTIVE"],
    ["QUEST_FINISH", "FINISH"],
    ["IMAGE", "UNKNOWN"],
  ] as const)("convertit %s en %s", (elementType, expected) => {
    expect(relationTypeForElement(elementType)).toBe(expected);
  });
});

describe("extractQuestOccurrences", () => {
  it("extrait les champs utiles d'une quete", () => {
    const rawValue = {
      id: "quest:132",
      link: "https://www.dofuspourlesnoobs.com/bouc-a-misere.html",
      name: "47. Bouc à misère",
      type: "ALI",
      name_pnj: "Amayiro",
      pnj_image: "https://example.test/amayiro.png",
      position_start: {
        cmd: "/travel -32,-57",
        map: "AMAKNA",
        position: "[-32,-57]",
      },
    };

    const [occurrence] = extractQuestOccurrences({
      guideId: -1,
      stepNumber: 111,
      element: questElement("QUEST", rawValue),
      sourceElementOrder: 3,
      firstSortOrder: 7,
    });

    expect(occurrence).toMatchObject({
      relationType: "ACTIVE",
      sortOrder: 7,
      sourceElementOrder: 3,
      sourceValueOrder: 0,
      quest: {
        questKey: "quest:132",
        sourceQuestKey: "quest:132",
        originalName: "47. Bouc à misère",
        normalizedName: "bouc a misere",
        sequenceNumber: 47,
        externalUrl: rawValue.link,
        category: "ALI",
        npcName: "Amayiro",
        npcImageUrl: "https://example.test/amayiro.png",
        startX: -32,
        startY: -57,
        startMap: "AMAKNA",
        travelCommand: "/travel -32,-57",
      },
    });
    expect(occurrence?.quest.rawValue).toBe(rawValue);
  });

  it("rattache une cle quest_start a la quete canonique", () => {
    const [occurrence] = extractQuestOccurrences({
      guideId: -1,
      stepNumber: 2,
      element: questElement("QUEST_START", {
        id: "quest_start:903",
        name: "1. Une quête",
      }),
      sourceElementOrder: 0,
    });

    expect(occurrence?.relationType).toBe("START");
    expect(occurrence?.quest.questKey).toBe("quest:903");
    expect(occurrence?.quest.sourceQuestKey).toBe("quest_start:903");
  });

  it("accepte les tableaux et les chaines JSON", () => {
    const value = JSON.stringify([
      { id: "quest:1", name: "1. Première" },
      [{ id: "quest:2", name: "2. Seconde" }],
    ]);
    const occurrences = extractQuestOccurrences({
      guideId: -1,
      stepNumber: 10,
      element: questElement("QUEST_FINISH", value),
      sourceElementOrder: 4,
      firstSortOrder: 2,
    });

    expect(occurrences.map(({ quest }) => quest.questKey)).toEqual(["quest:1", "quest:2"]);
    expect(occurrences.map(({ sortOrder }) => sortOrder)).toEqual([2, 3]);
    expect(occurrences.every(({ relationType }) => relationType === "FINISH")).toBe(true);
  });

  it("comprend aussi les coordonnees separees par des espaces", () => {
    const [fromPosition] = extractQuestOccurrences({
      guideId: -1,
      stepNumber: 3,
      element: questElement("QUEST", {
        id: "quest:3",
        position_start: { position: "[1 -15]" },
      }),
      sourceElementOrder: 0,
    });
    const [fromCommand] = extractQuestOccurrences({
      guideId: -1,
      stepNumber: 3,
      element: questElement("QUEST", {
        id: "quest:4",
        position_start: { cmd: "/travel 2 -16" },
      }),
      sourceElementOrder: 1,
    });

    expect(fromPosition?.quest).toMatchObject({ startX: 1, startY: -15 });
    expect(fromCommand?.quest).toMatchObject({ startX: 2, startY: -16 });
  });

  it("genere une cle deterministe si la cle distante manque", () => {
    const options = {
      guideId: -1,
      stepNumber: 111,
      element: questElement("QUEST", { name: "Sans identifiant" }, 42),
      sourceElementOrder: 0,
    };

    const first = extractQuestOccurrences(options);
    const second = extractQuestOccurrences(options);

    expect(first[0]?.quest.questKey).toBe("synthetic:-1:111:42:0");
    expect(second[0]?.quest.questKey).toBe(first[0]?.quest.questKey);
  });

  it("ignore les valeurs malformees et les types non-quetes", () => {
    expect(
      extractQuestOccurrences({
        guideId: -1,
        stepNumber: 1,
        element: questElement("QUEST", "{json invalide"),
        sourceElementOrder: 0,
      }),
    ).toEqual([]);
    expect(
      extractQuestOccurrences({
        guideId: -1,
        stepNumber: 1,
        element: questElement("INCONNU", { id: "quest:1" }),
        sourceElementOrder: 0,
      }),
    ).toEqual([]);
  });
});
