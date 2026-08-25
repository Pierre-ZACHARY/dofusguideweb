import type { GuideMetadata } from "../types/dofusGuide.js";

export const DEFAULT_GUIDE_NAME = "Guide Principal (Mono/Multi)";
export const DEFAULT_FALLBACK_GUIDE_ID = -1;

export interface GuideSelection {
  guideId?: number;
  guideName?: string;
  fallbackGuideId?: number;
}

export interface SelectGuideOptions extends GuideSelection {
  logger?: Pick<Console, "warn">;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR");
}

export function selectGuide(
  guides: GuideMetadata[],
  options: SelectGuideOptions = {},
): GuideMetadata {
  if (options.guideId !== undefined) {
    const guide = guides.find((candidate) => candidate.id === options.guideId);
    if (guide === undefined) {
      throw new Error(`Guide id=${options.guideId} was not found in the public guide list`);
    }
    return guide;
  }

  const requestedName = options.guideName ?? DEFAULT_GUIDE_NAME;
  const needle = normalizedName(requestedName);
  const exactMatches = guides.filter((guide) => normalizedName(guide.name) === needle);
  if (exactMatches.length === 1) {
    return exactMatches[0]!;
  }

  const partialMatches = guides.filter((guide) => normalizedName(guide.name).includes(needle));
  if (partialMatches.length === 1) {
    return partialMatches[0]!;
  }
  if (partialMatches.length > 1) {
    const candidates = partialMatches.map((guide) => `${guide.name} (id=${guide.id})`).join(", ");
    throw new Error(`Guide name "${requestedName}" is ambiguous: ${candidates}`);
  }

  const fallbackGuideId = options.fallbackGuideId ?? DEFAULT_FALLBACK_GUIDE_ID;
  const fallback = guides.find((guide) => guide.id === fallbackGuideId);
  if (fallback === undefined) {
    throw new Error(
      `Guide name "${requestedName}" was not found and fallback id=${fallbackGuideId} is unavailable`,
    );
  }

  options.logger?.warn(
    `[guide] name "${requestedName}" not found; using fallback id=${fallbackGuideId}`,
  );
  return fallback;
}
