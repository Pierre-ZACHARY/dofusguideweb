import type { GuideElementDto } from "../data/models.js";
import { asObject, textValue } from "./valueUtils.js";

export interface ClassQuestGroup {
  classElementId: number;
  questElementId: number;
  travelElementId: number;
  className: string;
  questName: string;
  questUrl: string | null;
  position: {
    map: string | null;
    position: string | null;
    cmd: string | null;
  };
}

function xOf(element: GuideElementDto): number {
  return element.position.x ?? Number.POSITIVE_INFINITY;
}

export function extractClassQuestGroups(elements: GuideElementDto[]): { groups: ClassQuestGroup[]; consumedIds: Set<number> } {
  const rows = new Map<number, GuideElementDto[]>();
  for (const element of elements) {
    if (element.position.y === null) continue;
    const row = rows.get(element.position.y) ?? [];
    row.push(element);
    rows.set(element.position.y, row);
  }

  const groups: ClassQuestGroup[] = [];
  const consumedIds = new Set<number>();
  for (const [, row] of [...rows].sort(([left], [right]) => left - right)) {
    const travel = row.find((element) => element.type === "TRAVEL");
    const texts = row.filter((element) => element.type === "TEXTE" && typeof element.value === "string").sort((left, right) => xOf(left) - xOf(right));
    const classElement = texts[0];
    const linkElement = row.find((element) => element.type === "LIEN");
    const questElement = linkElement ?? texts.find((element) => element.id !== classElement?.id);
    if (!travel || !classElement || !questElement || typeof classElement.value !== "string") continue;

    const questValue = asObject(questElement.value);
    const travelValue = asObject(travel.value);
    const questName = questElement.type === "LIEN"
      ? textValue(questValue?.label)
      : typeof questElement.value === "string" ? questElement.value : null;
    if (!questName) continue;

    groups.push({
      classElementId: classElement.id,
      questElementId: questElement.id,
      travelElementId: travel.id,
      className: classElement.value.trim(),
      questName: questName.trim(),
      questUrl: textValue(questValue?.link),
      position: {
        map: textValue(travelValue?.map),
        position: textValue(travelValue?.label),
        cmd: textValue(travelValue?.link),
      },
    });
    consumedIds.add(classElement.id);
    consumedIds.add(questElement.id);
    consumedIds.add(travel.id);
  }
  return { groups, consumedIds };
}
