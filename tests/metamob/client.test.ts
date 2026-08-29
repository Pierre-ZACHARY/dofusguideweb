import { describe, expect, it, vi } from "vitest";
import { MetaMobClient, normalizeMetaMobMonsterName } from "../../src/metamob/client.js";

const quest = {
  slug: "ocre-zobal",
  character_name: "Zobal-Test",
  parallel_quests: 1,
  server: { id: 1, name: "Draconiros" },
  quest_template: { id: 1, monster_count: 337, step_count: 34 },
};

describe("MetaMobClient", () => {
  it("preserves the Cloudflare runtime fetch receiver", async () => {
    const runtimeFetch = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ data: [] }));
    });
    vi.stubGlobal("fetch", runtimeFetch);

    try {
      await expect(new MetaMobClient("secret").validateCredentials()).resolves.toBeUndefined();
      expect(runtimeFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lists character names from the account quest list", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [quest] }), { status: 200 }));
    const quests = await new MetaMobClient("secret", fetcher as typeof fetch).listUserQuests("joueur");
    expect(quests).toEqual([{ slug: "ocre-zobal", characterName: "Zobal-Test", parallelQuests: 1, serverName: "Draconiros", templateMonsterCount: 337 }]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/v1/users/joueur/quests");
  });

  it("uses owned as the captured count and sends Boolean completion as 0 or 1", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify({ data: { owned: 1 } }), { status: 200 });
      return new Response(JSON.stringify({ data: [{
        subzones: [{ monsters: [{ id: 2345, name: { fr: "Pioukas la Plante" }, type: { id: 3 }, owned: 2 }] }],
      }] }), { status: 200 });
    });
    const client = new MetaMobClient("secret", fetcher as typeof fetch);
    await expect(client.listArchmonsters("ocre-zobal")).resolves.toEqual([
      { id: 2345, name: "Pioukas la Plante", quantity: 2 },
    ]);
    await client.setMonsterQuantity("ocre-zobal", 2345, 1);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ quantity: 1 }));
  });

  it("treats a missing public username as an empty quest list", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response("not found", { status: 404 }));
    await expect(new MetaMobClient("secret", fetcher as typeof fetch).listUserQuests("inconnu")).resolves.toEqual([]);
  });

  it("normalizes accents and punctuation for a safe name fallback", () => {
    expect(normalizeMetaMobMonsterName("  Pioukas-l’Épine  ")).toBe("pioukas l epine");
  });
});
