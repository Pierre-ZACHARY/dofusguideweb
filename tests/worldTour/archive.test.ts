import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { worldTourArchiveSchema } from "../../src/worldTour/types.js";

describe("real DofusDB world tour archive", () => {
  it("contains the 27 and 29 dungeon routes and documents the guide coverage", async () => {
    const archive = worldTourArchiveSchema.parse(JSON.parse(await readFile("data/dofusdb/world-tour.json", "utf8")) as unknown);
    expect(archive.tracks.map((track) => track.dungeons.length)).toEqual([27, 29]);
    expect(archive.tracks.flatMap((track) => track.dungeons).every((dungeon) =>
      dungeon.bossImageUrl?.startsWith("/world-tour/monsters/")
    )).toBe(true);
    const unmatched = archive.tracks.flatMap((track) => track.dungeons).filter((dungeon) => dungeon.guideStep === null);
    expect(unmatched.map((dungeon) => dungeon.dungeonName)).toEqual(["Antre du Kralamoure Géant"]);
    expect(archive.tracks.flatMap((track) => track.dungeons).every((dungeon) =>
      dungeon.dofusPourLesNoobsUrl?.endsWith("#sorts-expedition")
    )).toBe(true);
  });
});
