import { describe, expect, it } from "vitest";
import { buildStepPrompt } from "../../src/questGuides/generateStepPrompts.js";
import type { GuideStepRecord, StepQuestRecord } from "../../src/repositories/contracts.js";

function quest(questKey: string, title: string, sourceUrl: string): StepQuestRecord {
  return {
    id: 1,
    questKey,
    sourceQuestKey: null,
    originalName: title,
    normalizedName: title.toLocaleLowerCase("fr-FR"),
    sequenceNumber: null,
    externalUrl: sourceUrl,
    category: "QUEST",
    npcName: null,
    npcImageUrl: null,
    startX: null,
    startY: null,
    startMap: null,
    travelCommand: null,
    rawValue: null,
    relationType: "ACTIVE",
    sortOrder: 0,
  };
}

function step(stepNumber: number, title: string, quests: StepQuestRecord[]): GuideStepRecord {
  return {
    id: stepNumber,
    guideId: -1,
    chapterId: null,
    stepNumber,
    recommendedLevelMin: 100,
    recommendedLevelMax: 110,
    title,
    raw: null,
    elements: [],
    quests,
  };
}

function context(value: GuideStepRecord) {
  const articles = new Map(value.quests.flatMap((entry) => entry.externalUrl === null ? [] : [[entry.externalUrl, {
    sourceUrl: entry.externalUrl,
    title: entry.originalName ?? entry.questKey,
    content: "Contenu détaillé de " + (entry.originalName ?? entry.questKey) + " sur DofusPourLesNoobs.",
    sourceHash: String(value.stepNumber).padStart(64, "a").slice(-64),
  }] as const]));
  return { step: value, articles };
}

describe("step tutorial prompts", () => {
  it("inclut le contexte adjacent mais limite la génération à l'étape actuelle", () => {
    const prompt = buildStepPrompt(
      context(step(9, "Lancer les quêtes", [quest("quest:before", "Avant", "https://www.dofuspourlesnoobs.com/avant.html")])),
      context(step(10, "Faire le donjon", [
        quest("quest:boss", "Battre le boss", "https://www.dofuspourlesnoobs.com/boss.html"),
        quest("quest:mobs", "Tuer les monstres", "https://www.dofuspourlesnoobs.com/monstres.html"),
      ])),
      context(step(11, "Rendre les quêtes", [quest("quest:after", "Après", "https://www.dofuspourlesnoobs.com/apres.html")])),
      "data/generated/quest-summaries/-1/0010.json",
    );

    expect(prompt).toContain("Étape 9 : Lancer les quêtes");
    expect(prompt).toContain("Étape 10 : Faire le donjon");
    expect(prompt).toContain("Étape 11 : Rendre les quêtes");
    expect(prompt).toContain("quest:boss");
    expect(prompt).toContain("quest:mobs");
    expect(prompt).toContain("tips sert uniquement aux optimisations");
    expect(prompt).toContain("Contexte uniquement : ne génère aucun tutoriel pour cette section.");
    expect(prompt).toContain("data/generated/quest-summaries/-1/0010.json");
    expect(prompt).toContain('"version"');
    expect(prompt).toContain('"summaries"');
  });
});
