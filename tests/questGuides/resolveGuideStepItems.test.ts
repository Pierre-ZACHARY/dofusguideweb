import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GuideStepRecord } from "../../src/repositories/contracts.js";
import { resolveGuideStepItems } from "../../src/questGuides/resolveGuideStepItems.js";
import type { QuestGuideContent } from "../../src/questGuides/types.js";

describe("resolveGuideStepItems", () => {
  it("uses an exact normalized DofusGuide item identity and archives its image", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dofusguide-step-items-"));
    const content: QuestGuideContent = {
      overview: "Préparer de l’eau.", recommendedLevel: 1, prerequisites: [], rewards: [], preparation: [], notes: [], npcs: [],
      actions: [{ instruction: "Acheter.", position: null, zoneHint: null, warning: null, combat: "NONE" }],
      items: [{ name: "Eau potable", itemId: null, imageUrl: null, dofusDbUrl: null }],
    };
    const step = {
      elements: [{ elementType: "ITEMS", rawValue: { id: "items:1719", name: "Eau Potable", image: "https://images.invalid/1719.png" } }],
    } as GuideStepRecord;
    const itemFetch = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "image/png" } }));
    try {
      const result = await resolveGuideStepItems(content, step, { itemFetch, publicItemDirectory: directory });
      expect(result.items).toEqual([{ name: "Eau Potable", itemId: 1719, imageUrl: "/items/1719.png", dofusDbUrl: "https://dofusdb.fr/fr/database/item/1719" }]);
      expect([...await readFile(path.join(directory, "1719.png"))]).toEqual([4, 5, 6]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
