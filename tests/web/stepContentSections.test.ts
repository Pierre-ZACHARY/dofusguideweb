import { describe, expect, it } from "vitest";
import { buildStepInteractiveSections } from "../../src/web/components/stepContentSections.js";
import type { GuideElementDto, StepQuestDto } from "../../src/web/data/models.js";

function element(id: number, type: string, visualOrder: number): GuideElementDto {
  return {
    id,
    remoteId: id,
    type,
    sourceOrder: visualOrder,
    visualOrder,
    position: { x: 0, y: visualOrder, width: null, height: null },
    font: null,
    value: null,
  };
}

function quest(questKey: string, relation: StepQuestDto["relation"], sortOrder: number): StepQuestDto {
  return {
    questKey,
    originalName: questKey,
    normalizedName: questKey,
    sequenceNumber: null,
    externalUrl: null,
    category: relation,
    npcName: null,
    npcImageUrl: null,
    startX: null,
    startY: null,
    startMap: null,
    travelCommand: null,
    relation,
    sortOrder,
    value: null,
  };
}

describe("step interactive sections", () => {
  it("sépare les quêtes placées avant et après un donjon", () => {
    const sections = buildStepInteractiveSections([
      element(1, "QUEST_START", 2),
      element(2, "QUEST", 3),
      element(3, "QUEST_START", 4),
      element(4, "DUNGEON", 5),
      element(5, "QUEST_FINISH", 6),
    ], [
      quest("quest:806", "START", 0),
      quest("quest:1024", "ACTIVE", 1),
      quest("quest:1025", "START", 2),
      quest("quest:1025", "FINISH", 3),
    ]);

    expect(sections.map((section) => section.kind)).toEqual(["quests", "dungeons", "quests"]);
    expect(sections[0]?.kind === "quests" && sections[0].quests.map((entry) => entry.relation)).toEqual(["START", "ACTIVE", "START"]);
    expect(sections[1]?.kind === "dungeons" && sections[1].dungeons.map((entry) => entry.id)).toEqual([4]);
    expect(sections[2]?.kind === "quests" && sections[2].quests.map((entry) => entry.relation)).toEqual(["FINISH"]);
  });

  it("conserve un seul bloc quand les quêtes sont contiguës", () => {
    const sections = buildStepInteractiveSections([
      element(1, "QUEST", 1),
      element(2, "QUEST_FINISH", 2),
    ], [quest("quest:1", "ACTIVE", 0), quest("quest:2", "FINISH", 1)]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.kind === "quests" && sections[0].quests).toHaveLength(2);
  });
});
