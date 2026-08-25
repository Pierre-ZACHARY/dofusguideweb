import { describe, expect, it } from "vitest";
import { parseClineJsonOutput } from "../../src/questGuides/generateQuestSummaryWithCline.js";

const content = {
  overview: "Parlez au PNJ puis terminez la quête.",
  recommendedLevel: 100,
  prerequisites: [],
  rewards: [],
  preparation: [],
  actions: [{ instruction: "Parlez au PNJ.", position: "[1,-2]", zoneHint: "Égouts d'Astrub", warning: null, combat: "NONE" }],
  notes: [],
  npcs: ["PNJ"],
  items: [],
};

describe("parseClineJsonOutput", () => {
  it("prend le dernier run_result JSONL et accepte un bloc JSON clôturé", () => {
    const stdout = [
      JSON.stringify({ type: "agent_event", event: { type: "content_start", text: "ignore" } }),
      JSON.stringify({
        type: "run_result",
        finishReason: "completed",
        text: "```json\n" + JSON.stringify(content) + "\n```",
        model: { id: "cline-pass/deepseek-v4-pro", provider: "cline" },
      }),
    ].join("\n");
    const result = parseClineJsonOutput(stdout);
    expect(result.model).toBe("cline-pass/deepseek-v4-pro");
    expect(result.content.actions[0]?.zoneHint).toBe("Égouts d'Astrub");
  });

  it("refuse une exécution interrompue", () => {
    const stdout = JSON.stringify({ type: "run_result", finishReason: "timeout", text: JSON.stringify(content) });
    expect(() => parseClineJsonOutput(stdout)).toThrow("did not complete");
  });

  it("refuse une réponse qui ne respecte pas le schéma métier", () => {
    const stdout = JSON.stringify({ type: "run_result", finishReason: "completed", text: JSON.stringify({ overview: "incomplet" }) });
    expect(() => parseClineJsonOutput(stdout)).toThrow();
  });
});
