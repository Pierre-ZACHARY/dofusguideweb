import { describe, expect, it } from "vitest";
import { normalizeCliArgs } from "../src/cli.js";

describe("normalizeCliArgs", () => {
  it("keeps the documented negative guide id syntax compatible with util.parseArgs", () => {
    expect(normalizeCliArgs(["scrape", "--guide", "-1", "--step", "111"])).toEqual([
      "scrape",
      "--guide=-1",
      "--step",
      "111",
    ]);
  });

  it("does not rewrite unrelated option values", () => {
    expect(normalizeCliArgs(["guides", "--retries", "3"])).toEqual([
      "guides",
      "--retries",
      "3",
    ]);
  });

  it("normalizes a negative fallback id too", () => {
    expect(
      normalizeCliArgs(["scrape", "--guide-name", "Missing", "--fallback-guide-id", "-1"]),
    ).toEqual(["scrape", "--guide-name", "Missing", "--fallback-guide-id=-1"]);
  });
});
