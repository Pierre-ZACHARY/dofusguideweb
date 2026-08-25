import { describe, expect, it } from "vitest";
import {
  buildDofusDbProfileRendererUrl,
  encodeDofusDbLook,
} from "../../src/breeds/scrapeDofusDbBreeds.js";

describe("DofusDB profile renderer", () => {
  it("encode le jeton look avec le format hexadecimal attendu par DofusDB", () => {
    expect(encodeDofusDbLook("YWJjZA==")).toBe("59574a6a5a413d3d");
  });

  it("utilise les directions affichees par la page Classes", () => {
    expect(buildDofusDbProfileRendererUrl("https://renderer.example", "look-token", "male"))
      .toBe("https://renderer.example/kool/6c6f6f6b2d746f6b656e/full/1/300_300.png");
    expect(buildDofusDbProfileRendererUrl("https://renderer.example", "look-token", "female"))
      .toBe("https://renderer.example/kool/6c6f6f6b2d746f6b656e/full/3/300_300.png");
  });
});
