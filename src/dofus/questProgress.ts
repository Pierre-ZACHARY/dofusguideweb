export interface TaggedQuestOccurrence {
  questKey: string;
  stepNumber: number;
  relationType: string;
  rawValue: unknown;
}

export interface TaggedQuestCompletion {
  questKey: string;
  completionStep: number;
}

function tagsFromValue(rawValue: unknown): string[] {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) return [];
  const record = rawValue as Record<string, unknown>;
  const value = record.dofus_quest;
  const tags = typeof value === "string" && value.trim() !== ""
    ? [value.trim()]
    : Array.isArray(value)
      ? value.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim())
      : [];
  if (typeof record.type === "string") {
    for (const definition of DOFUS_TAG_DEFINITIONS) {
      if (definition.questTypeAliases?.includes(record.type)) tags.push(definition.tag);
    }
  }
  return [...new Set(tags)];
}

export function firstTaggedQuestAppearances(occurrences: TaggedQuestOccurrence[]): Map<string, number> {
  const firstSteps = new Map<string, number>();
  for (const occurrence of occurrences) {
    for (const tag of tagsFromValue(occurrence.rawValue)) {
      const current = firstSteps.get(tag);
      if (current === undefined || occurrence.stepNumber < current) firstSteps.set(tag, occurrence.stepNumber);
    }
  }
  return firstSteps;
}

export interface DofusSortCandidate {
  tag: string;
  level: number | null;
  name: string;
}

export function sortDofusByLevelAndAppearance<T extends DofusSortCandidate>(
  items: T[],
  firstAppearances: ReadonlyMap<string, number>,
): T[] {
  return [...items].sort((left, right) =>
    (left.level ?? Number.MAX_SAFE_INTEGER) - (right.level ?? Number.MAX_SAFE_INTEGER)
    || (firstAppearances.get(left.tag) ?? Number.MAX_SAFE_INTEGER) - (firstAppearances.get(right.tag) ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name, "fr"),
  );
}

function relationPriority(relationType: string): number {
  if (relationType === "FINISH") return 3;
  if (relationType === "ACTIVE") return 2;
  if (relationType === "UNKNOWN") return 1;
  return 0;
}

export function groupTaggedQuestCompletions(occurrences: TaggedQuestOccurrence[]): Map<string, TaggedQuestCompletion[]> {
  const tags = new Map<string, Map<string, { stepNumber: number; priority: number }>>();
  for (const occurrence of occurrences) {
    for (const tag of tagsFromValue(occurrence.rawValue)) {
      const quests = tags.get(tag) ?? new Map<string, { stepNumber: number; priority: number }>();
      const candidate = { stepNumber: occurrence.stepNumber, priority: relationPriority(occurrence.relationType) };
      const current = quests.get(occurrence.questKey);
      if (!current || candidate.priority > current.priority || (candidate.priority === current.priority && candidate.stepNumber > current.stepNumber)) {
        quests.set(occurrence.questKey, candidate);
      }
      tags.set(tag, quests);
    }
  }
  return new Map([...tags].map(([tag, quests]) => [
    tag,
    [...quests].map(([questKey, value]) => ({ questKey, completionStep: value.stepNumber })).sort((left, right) => left.completionStep - right.completionStep || left.questKey.localeCompare(right.questKey)),
  ]));
}
import { DOFUS_TAG_DEFINITIONS } from "./tagDefinitions.js";
