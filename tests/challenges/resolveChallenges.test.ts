import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { matchChallenge } from "../../src/challenges/resolveChallenges.js";
import type { DofusDbChallengeArchive } from "../../src/challenges/types.js";

describe("DofusDB challenge matching", () => {
  it("résout un succès réel du donjon de Kardorim depuis l’archive locale", async () => {
    const archive = JSON.parse(await readFile("data/dofusdb/challenges.json", "utf8")) as DofusDbChallengeArchive;
    const match = matchChallenge({
      id: 5635,
      name: "Duo",
      description: "Vaincre tous les monstres avec 2 personnages maximum et en moins de 20 tours.",
    }, archive.challenges);

    expect(archive.total).toBe(842);
    expect(match?.name.fr).toBe("Duo");
    expect(match?.iconId).toBeTypeOf("number");
  });
});
