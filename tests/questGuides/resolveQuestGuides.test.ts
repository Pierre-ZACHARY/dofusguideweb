import { describe, expect, it } from "vitest";
import { normalizeGeneratedSourceUrl } from "../../src/questGuides/resolveQuestGuides.js";
import { splitRichTextTerms } from "../../src/web/components/QuestGuideSummary.js";

describe("normalizeGeneratedSourceUrl", () => {
  it("extracts an URL accidentally wrapped as a Markdown link", () => {
    expect(normalizeGeneratedSourceUrl("[https://example.test/quest.html](https://example.test/quest.html)")).toBe("https://example.test/quest.html");
  });

  it("preserves a canonical URL", () => {
    expect(normalizeGeneratedSourceUrl("https://example.test/quest.html")).toBe("https://example.test/quest.html");
  });
});

describe("splitRichTextTerms", () => {
  it("matches a short item only as a complete word", () => {
    expect(splitRichTextTerms("Une fois le Livre et l’Os en votre possession", ["Livre", "Os"]))
      .toEqual([
        { text: "Une fois le ", term: null },
        { text: "Livre", term: "Livre" },
        { text: " et l’", term: null },
        { text: "Os", term: "Os" },
        { text: " en votre possession", term: null },
      ]);
  });
});
