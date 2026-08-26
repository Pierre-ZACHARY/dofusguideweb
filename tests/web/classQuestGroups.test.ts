import { afterAll, describe, expect, it } from "vitest";
import { extractClassQuestGroups } from "../../src/web/components/classQuestGroups.js";
import type { GuideElementDto } from "../../src/web/data/models.js";
import type { GuideElement } from "../../src/types/dofusGuide.js";
import { SqliteDofusGuideRepository } from "../../src/repositories/sqliteDofusGuideRepository.js";

const repository = new SqliteDofusGuideRepository("data/dofusguide.sqlite");

afterAll(() => repository.close());

function dto(element: GuideElement, sourceOrder: number): GuideElementDto {
  return {
    id: element.id,
    remoteId: element.id,
    type: element.type,
    sourceOrder,
    visualOrder: sourceOrder,
    position: {
      x: element.pos ? Number(element.pos.pos_x) : null,
      y: element.pos ? Number(element.pos.pos_y) : null,
      width: element.pos?.largeur === undefined ? null : Number(element.pos.largeur),
      height: element.pos?.hauteur === undefined ? null : Number(element.pos.hauteur),
    },
    font: (element.font ?? null) as GuideElementDto["font"],
    value: element.valeur as GuideElementDto["value"],
  };
}

describe("class quest grouping", () => {
  it("regroupe les 19 triplets réels de l’étape 16 sans exposer le marqueur CAC", () => {
    const step = repository.getGuideStep(-1, 16);
    if (step === undefined) throw new Error("Missing archived guide step 16");
    const raw = step.raw as GuideElement[];
    const result = extractClassQuestGroups(raw.map(dto));

    expect(result.groups).toHaveLength(19);
    expect(result.consumedIds.size).toBe(57);
    expect(result.groups[0]).toMatchObject({
      className: "Cra",
      questName: "C'est pour ta pomme.",
      questUrl: "https://www.dofuspourlesnoobs.com/c-est-pour-ta-pomme.html",
      position: { map: "AMAKNA", position: "[2,-16]", cmd: "/travel 2,-16" },
    });
    expect(result.groups.find((group) => group.className === "Énutrof")?.questUrl).toBeNull();
  });
});
