import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ElementRenderer } from "../../src/web/components/ElementRenderer.js";
import { QuestChecklist } from "../../src/web/components/QuestChecklist.js";
import type { StepQuestDto } from "../../src/web/data/models.js";
import { ProgressProvider } from "../../src/web/progress/progressStore.js";

const quests: StepQuestDto[] = [
  {
    questKey: "quest:898",
    originalName: "Réponses à tout",
    normalizedName: "reponses a tout",
    sequenceNumber: null,
    externalUrl: null,
    category: "QUEST",
    npcName: "Ganymède",
    npcImageUrl: "https://example.test/ganymede.png",
    startX: -3,
    startY: -3,
    startMap: "INCARNAM",
    travelCommand: "/travel -3,-3",
    relation: "ACTIVE",
    sortOrder: 0,
    value: { position_start: { map: "INCARNAM", position: "[-3,-3]", cmd: "/travel -3,-3" } },
  },
  {
    questKey: "quest:903",
    originalName: "La galette secrète",
    normalizedName: "la galette secrete",
    sequenceNumber: null,
    externalUrl: null,
    category: "QUEST_START",
    npcName: "Anta Brok",
    npcImageUrl: "https://example.test/anta.png",
    startX: 1,
    startY: -2,
    startMap: "INCARNAM",
    travelCommand: "/travel 1,-2",
    relation: "START",
    sortOrder: 1,
    value: { position_start: { map: "INCARNAM", position: "[1,-2]", cmd: "/travel 1,-2" } },
  },
];

describe("step checklist", () => {
  it("affiche toutes les quêtes mais seulement les détails de la première à faire", () => {
    const html = renderToStaticMarkup(
      <ProgressProvider><QuestChecklist guideId={-1} stepNumber={6} quests={quests} /></ProgressProvider>,
    );
    expect(html).toContain("Réponses à tout");
    expect(html).toContain("La galette secrète");
    expect(html).toContain("Ganymède");
    expect(html).not.toContain("Anta Brok");
    expect(html).not.toContain("<select");
  });

  it("rend un objet compact avec une quantité abrégée", () => {
    const html = renderToStaticMarkup(<ElementRenderer element={{
      id: 1,
      remoteId: 1,
      type: "ITEMS",
      sourceOrder: 0,
      visualOrder: 0,
      position: { x: 0, y: 0, width: null, height: null },
      font: null,
      value: { name: "Blé", qte: "18", image: "https://example.test/wheat.png" },
    }} />);
    expect(html).toContain("Blé");
    expect(html).toContain("x18");
    expect(html).not.toContain("Quantité");
    expect(html).toContain("h-10 w-10");
  });
});
