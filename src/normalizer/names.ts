const LEADING_SEQUENCE = /^\s*(\d+)\s*[.)]\s*/u;

export interface ParsedQuestName {
  originalName: string;
  nameWithoutSequence: string;
  normalizedName: string;
  sequenceNumber: number | null;
}

export function normalizeName(name: string): string {
  return name
    .replace(LEADING_SEQUENCE, "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function parseQuestName(name: string): ParsedQuestName {
  const match = LEADING_SEQUENCE.exec(name);
  const nameWithoutSequence = name.replace(LEADING_SEQUENCE, "").trim();
  return {
    originalName: name,
    nameWithoutSequence,
    normalizedName: normalizeName(name),
    sequenceNumber: match?.[1] === undefined ? null : Number(match[1]),
  };
}
