// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DungeonCard } from "../../src/web/components/DungeonCard.js";
import type { GuideElementDto } from "../../src/web/data/models.js";
import { ProgressProvider } from "../../src/web/progress/progressStore.js";

const element: GuideElementDto = {
  id: 12,
  remoteId: 12,
  type: "DUNGEON",
  sourceOrder: 0,
  visualOrder: 0,
  position: { x: 0, y: 0, width: 100, height: 100 },
  font: null,
  value: {
    id: "dungeon:1",
    name: "Crypte de Kardorim",
    image: "https://example.invalid/kardorim.png",
    success: [
      { id: 5635, nom: "Duo", description: "Deux personnages maximum." },
      { id: 5636, nom: "Zombie", description: "Un point de mouvement." },
    ],
  },
  resolvedChallenges: [
    { successId: "5635", challengeId: 57, name: "Duo", description: "Deux personnages maximum.", imageUrl: "/challenges/10023.png" },
  ],
};

describe("DungeonCard interactions", () => {
  beforeEach(() => localStorage.clear());

  it("utilise l’icône pour déplier la description et place la checkbox avec le nom", async () => {
    const user = userEvent.setup();
    render(
      <ProgressProvider>
        <DungeonCard element={element} guideId={-1} stepNumber={12} featured />
      </ProgressProvider>,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("Deux personnages maximum.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Afficher la description du succès Duo" }));
    expect(screen.getByText("Deux personnages maximum.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masquer la description du succès Duo" }).getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("checkbox", { name: "Valider le succès Duo" }));
    expect(screen.getByText("Duo").className).toContain("line-through");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("dofusguide.progress.v2") ?? "{}") as { steps?: Record<string, string>; dungeonSuccesses?: Record<string, true> };
      expect(JSON.stringify(saved.dungeonSuccesses)).toContain("dungeon:1");
      expect(saved.steps?.["-1:12"]).toBeUndefined();
    });
  });
});
