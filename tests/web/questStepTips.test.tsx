import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestStepTips } from "../../src/web/components/QuestStepTips.js";
import type { StepQuestDto } from "../../src/web/data/models.js";

function quest(questKey: string, originalName: string): StepQuestDto {
  return {
    questKey,
    originalName,
    normalizedName: originalName.toLocaleLowerCase("fr-FR"),
    sequenceNumber: null,
    externalUrl: null,
    category: "QUEST",
    npcName: null,
    npcImageUrl: null,
    startX: null,
    startY: null,
    startMap: null,
    travelCommand: null,
    relation: "ACTIVE",
    sortOrder: 0,
    value: null,
  };
}

describe("QuestStepTips", () => {
  it("affiche les quêtes à combiner et le parcours conseillé", () => {
    const html = renderToStaticMarkup(<QuestStepTips quests={[
      quest("quest:boss", "Battre le boss"),
      quest("quest:mobs", "Tuer les monstres"),
    ]} tips={[{
      title: "Regroupez les objectifs du donjon",
      description: "Gardez les deux quêtes actives avant d'entrer.",
      questKeys: ["quest:boss", "quest:mobs"],
      actions: ["Tuez les monstres pendant le chemin vers le boss."],
    }]} />);

    expect(html).toContain("Regroupez les objectifs du donjon");
    expect(html).toContain("Battre le boss");
    expect(html).toContain("Tuer les monstres");
    expect(html).toContain("Tuez les monstres pendant le chemin vers le boss.");
  });
});
