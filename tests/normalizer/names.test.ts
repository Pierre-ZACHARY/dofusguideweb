import { describe, expect, it } from "vitest";

import { normalizeName, parseQuestName } from "../../src/normalizer/names.js";

describe("normalizeName", () => {
  it("retire le numero initial et les diacritiques", () => {
    expect(normalizeName("47. Bouc à misère")).toBe("bouc a misere");
  });

  it("normalise la ponctuation, les apostrophes et les espaces", () => {
    expect(normalizeName("  49. Quand y'en a marre de Brâkmar  ")).toBe(
      "quand y en a marre de brakmar",
    );
  });

  it("analyse le numero de sequence sans modifier la chaine source", () => {
    const source = "12) Flagrant délire";

    expect(parseQuestName(source)).toEqual({
      originalName: source,
      nameWithoutSequence: "Flagrant délire",
      normalizedName: "flagrant delire",
      sequenceNumber: 12,
    });
    expect(source).toBe("12) Flagrant délire");
  });

  it("ne tente pas de reparer automatiquement le mojibake", () => {
    const source = "47. Bouc Ã  misÃ¨re";
    const parsed = parseQuestName(source);

    expect(parsed.originalName).toBe(source);
    expect(parsed.nameWithoutSequence).toBe("Bouc Ã  misÃ¨re");
    expect(parsed.normalizedName).not.toBe("bouc a misere");
  });
});
