import { describe, expect, it, vi } from "vitest";
import { selectGuide } from "../../src/scraper/selectGuide.js";

const guides = [
  { id: -1, name: "Guide Principal (Mono/Multi)" },
  { id: 1, name: "Guide Dim Osavora" },
  { id: 340, name: "Guide Dofus Turquoise" },
  { id: 342, name: "Guide Dofus Pourpre" },
];

describe("selectGuide", () => {
  it("gives precedence to an explicit id", () => {
    expect(selectGuide(guides, { guideId: 340, guideName: "Principal" }).id).toBe(340);
  });

  it("matches names exactly without case sensitivity", () => {
    expect(selectGuide(guides, { guideName: "guide principal (mono/multi)" }).id).toBe(-1);
  });

  it("accepts one unambiguous partial name", () => {
    expect(selectGuide(guides, { guideName: "Principal" }).id).toBe(-1);
  });

  it("rejects ambiguous partial names", () => {
    expect(() => selectGuide(guides, { guideName: "Dofus" })).toThrow("ambiguous");
  });

  it("uses and logs the configurable fallback", () => {
    const logger = { warn: vi.fn() };

    expect(selectGuide(guides, { guideName: "Missing", fallbackGuideId: 1, logger }).id).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      '[guide] name "Missing" not found; using fallback id=1',
    );
  });
});
