import type { GuideElementDto, StepQuestDto } from "../data/models.js";

export type StepInteractiveSection =
  | { kind: "quests"; order: number; quests: StepQuestDto[] }
  | { kind: "dungeons"; order: number; dungeons: GuideElementDto[] };

export function buildStepInteractiveSections(
  elements: readonly GuideElementDto[],
  quests: readonly StepQuestDto[],
): StepInteractiveSection[] {
  const orderedElements = [...elements].sort((left, right) => left.visualOrder - right.visualOrder);
  const orderedQuests = [...quests].sort((left, right) => left.sortOrder - right.sortOrder);
  const sections: StepInteractiveSection[] = [];
  let questIndex = 0;

  for (const element of orderedElements) {
    if (element.type.startsWith("QUEST")) {
      const quest = orderedQuests[questIndex];
      questIndex += 1;
      if (quest === undefined) continue;
      const previous = sections.at(-1);
      if (previous?.kind === "quests") previous.quests.push(quest);
      else sections.push({ kind: "quests", order: element.visualOrder, quests: [quest] });
      continue;
    }
    if (element.type === "DUNGEON") {
      const previous = sections.at(-1);
      if (previous?.kind === "dungeons") previous.dungeons.push(element);
      else sections.push({ kind: "dungeons", order: element.visualOrder, dungeons: [element] });
    }
  }

  return sections;
}
