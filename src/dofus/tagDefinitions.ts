export interface DofusTagDefinition {
  tag: string;
  itemId: number;
  questTypeAliases?: readonly string[];
}

export const DOFUS_TAG_DEFINITIONS: readonly DofusTagDefinition[] = [
  { tag: "argenté", itemId: 19629 },
  { tag: "DDG", itemId: 7043 },
  { tag: "abyssal", itemId: 18043 },
  { tag: "ivoire", itemId: 7115, questTypeAliases: ["ALI", "ALI_START", "ALI_FINISH"] },
  { tag: "ébène", itemId: 7114 },
  { tag: "forgelave", itemId: 19398 },
  { tag: "veilleur", itemId: 16061 },
  { tag: "vulbis", itemId: 6980 },
  { tag: "pourpre", itemId: 694 },
  { tag: "cawotte", itemId: 972 },
  { tag: "domakuro", itemId: 23237 },
  { tag: "dokoko", itemId: 17078 },
  { tag: "dorigami", itemId: 23408 },
  { tag: "emeraude", itemId: 737 },
  { tag: "turquoise", itemId: 739 },
  { tag: "nébuleux", itemId: 8698 },
] as const;
