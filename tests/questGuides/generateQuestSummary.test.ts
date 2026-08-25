import { describe, expect, it, vi } from "vitest";
import { generateQuestSummary } from "../../src/questGuides/generateQuestSummary.js";

const article = {
  sourceUrl: "https://www.dofuspourlesnoobs.com/test.html",
  title: "Quête test",
  content: "Allez voir le PNJ en [1,-2], puis rapportez-lui la clef après le combat.",
  sourceHash: "a".repeat(64),
};

describe("generateQuestSummary", () => {
  it("demande une sortie structurée non stockée et valide sa réponse", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        overview: "Récupérez puis rapportez la clef.",
        recommendedLevel: 40,
        prerequisites: [],
        rewards: [],
        preparation: ["Une clef"],
        actions: [{ instruction: "Parlez au PNJ.", position: "[1,-2]", zoneHint: "Souterrains d'Astrub", warning: null, combat: "SOLO" }],
        notes: [],
        npcs: ["PNJ"],
        items: [{ name: "Clef", itemId: null, imageUrl: null, dofusDbUrl: null }],
      }) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await generateQuestSummary(article, { apiKey: "test-key", model: "test-model", fetch: request });
    expect(result.content.actions[0]?.position).toBe("[1,-2]");
    expect(result.content.actions[0]?.combat).toBe("SOLO");
    expect(result.content.actions[0]?.zoneHint).toBe("Souterrains d'Astrub");
    expect(result.content.items[0]?.name).toBe("Clef");
    const init = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.model).toBe("test-model");
    expect(JSON.stringify(body)).toContain("json_schema");
    expect(JSON.stringify(body)).toContain("zoneHint");
    expect(JSON.stringify(body)).toContain("plusieurs sous-zones");
    expect(JSON.stringify(body)).toContain("sépare-la en plusieurs actions");
  });

  it("refuse de fonctionner sans clé API", async () => {
    await expect(generateQuestSummary(article, { apiKey: "" })).rejects.toThrow("OPENAI_API_KEY");
  });
});
