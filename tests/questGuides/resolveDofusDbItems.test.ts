import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveQuestGuideItems } from "../../src/questGuides/resolveDofusDbItems.js";
import type { QuestGuideContent } from "../../src/questGuides/types.js";

const content: QuestGuideContent = {
  overview: "Préparez une corde.", recommendedLevel: 10, prerequisites: [], rewards: [], preparation: ["1 Corde d’escalade"],
  actions: [{ instruction: "Utilisez la corde.", position: "[1,2]", warning: null, combat: "NONE" }], notes: [], npcs: [],
  items: [{ name: "Corde d’escalade", itemId: null, imageUrl: null, dofusDbUrl: null }],
};

describe("resolveQuestGuideItems", () => {
  it("normalise les apostrophes, exige un nom exact et archive l’icône localement", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dofusguide-items-"));
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/img/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      const name = url.searchParams.get("name.fr");
      return Response.json({ data: name?.includes("’") ? [] : [{ id: 9935, iconId: 15170, img: "https://test.invalid/img/15170.png", name: { fr: "Corde d'escalade" } }] });
    });
    try {
      const result = await resolveQuestGuideItems(content, { itemFetch: request, dofusDbBaseUrl: "https://test.invalid", publicItemDirectory: directory, itemDelayMs: 0 });
      expect(result.items[0]).toEqual({ name: "Corde d'escalade", itemId: 9935, imageUrl: "/items/9935.png", dofusDbUrl: "https://dofusdb.fr/fr/database/item/9935" });
      expect([...await readFile(path.join(directory, "9935.png"))]).toEqual([1, 2, 3]);
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
