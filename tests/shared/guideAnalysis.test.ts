import { describe, expect, it } from "vitest";
import type { GuideElement } from "../../src/types/dofusGuide.js";
import {
  classifyGuideElementType,
  extractChapterMarker,
  extractRecommendedLevelRange,
  orderGuideElementsVisually,
} from "../../src/shared/guideAnalysis.js";

function element(id: number, x: number | string, y: number | string): GuideElement {
  return { id, tuto_id: -1, name: "Guide", etape: 1, type: "TEXTE", valeur: String(id), pos: { pos_x: x, pos_y: y } as never };
}

describe("guide analysis", () => {
  it("extracts chapters without guessing unnumbered headings", () => {
    expect(extractChapterMarker("<fc=255,192,0>3. Premiers pas en Amakna</fc=255,192,0>")).toMatchObject({ chapterNumber: 3, chapterName: "Premiers pas en Amakna" });
    expect(extractChapterMarker("Premiers pas en Amakna")).toBeNull();
  });

  it("extracts level ranges and conservative single levels", () => {
    expect(extractRecommendedLevelRange("lvl 20 à 50")).toMatchObject({ min: 20, max: 50 });
    expect(extractRecommendedLevelRange("<fc=1,2,3>lvl 200</fc=1,2,3>")).toMatchObject({ min: 200, max: 200 });
    expect(extractRecommendedLevelRange("niveau conseillé")).toBeNull();
  });

  it("sorts by y, x and then source order while retaining both orders", () => {
    const ordered = orderGuideElementsVisually([element(1, 20, "100"), element(2, 10, 50), element(3, 5, 100)]);
    expect(ordered.map((entry) => entry.element.id)).toEqual([2, 3, 1]);
    expect(ordered.map((entry) => entry.sourceOrder)).toEqual([1, 2, 0]);
  });

  it("keeps unknown types inspectable", () => {
    expect(classifyGuideElementType("DUNGEON")).toBe("DUNGEON");
    expect(classifyGuideElementType("FUTURE_TYPE")).toBe("UNKNOWN");
  });
});
