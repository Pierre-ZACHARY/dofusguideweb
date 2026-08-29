// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuestChecklist } from "../../src/web/components/QuestChecklist.js";
import type { StepQuestDto } from "../../src/web/data/models.js";
import { ProgressProvider } from "../../src/web/progress/progressStore.js";

const quests: StepQuestDto[] = [
  {
    questKey: "quest:898", originalName: "Réponses à tout", normalizedName: "reponses a tout", sequenceNumber: null,
    externalUrl: null, category: "QUEST", npcName: "Ganymède", npcImageUrl: null, startX: -3, startY: -3,
    startMap: "INCARNAM", travelCommand: "/travel -3,-3", relation: "ACTIVE", sortOrder: 0,
    value: { position_start: { map: "INCARNAM", position: "[-3,-3]", cmd: "/travel -3,-3" } },
  },
  {
    questKey: "quest:903", originalName: "La galette secrète", normalizedName: "la galette secrete", sequenceNumber: null,
    externalUrl: null, category: "QUEST_START", npcName: "Anta Brok", npcImageUrl: null, startX: 1, startY: -2,
    startMap: "INCARNAM", travelCommand: "/travel 1,-2", relation: "START", sortOrder: 1,
    value: { position_start: { map: "INCARNAM", position: "[1,-2]", cmd: "/travel 1,-2" } },
  },
];

function setDesktopViewport(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });
}

describe("QuestChecklist interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    setDesktopViewport(false);
  });
  afterEach(() => cleanup());

  it("barre l’objectif coché et ouvre automatiquement le suivant", async () => {
    const user = userEvent.setup();
    render(<ProgressProvider><QuestChecklist guideId={-1} stepNumber={6} quests={quests} /></ProgressProvider>);

    expect(screen.getByText("Ganymède")).toBeTruthy();
    expect(screen.queryByText("Anta Brok")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Ouvrir La galette secrète" }));
    expect(screen.queryByText("Ganymède")).toBeNull();
    expect(screen.getByText("Anta Brok")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ouvrir Réponses à tout" }));
    expect(screen.getByText("Ganymède")).toBeTruthy();
    expect(screen.queryByText("Anta Brok")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Valider Réponses à tout" }));

    expect(screen.getByText("Réponses à tout").className).toContain("line-through");
    await waitFor(() => {
      expect(screen.queryByText("Ganymède")).toBeNull();
      expect(screen.getByText("Anta Brok")).toBeTruthy();
    });

    await waitFor(() => {
      const stored = localStorage.getItem("dofusguide.progress.v2");
      expect(stored).toContain('"quest:898"');
      expect(stored).toContain('"COMPLETED"');
    });
  });

  it("affiche le tutoriel, replie les informations mobiles et valide la quête avec ses sous-étapes", async () => {
    const user = userEvent.setup();
    const summarized: StepQuestDto[] = [{
      ...quests[0]!,
      externalUrl: "https://www.dofuspourlesnoobs.com/reponses-a-tout.html",
      guideSummary: {
        sourceUrl: "https://www.dofuspourlesnoobs.com/reponses-a-tout.html",
        sourceTitle: "Réponses à tout",
        overview: "Parlez au PNJ puis rapportez sa réponse.",
        recommendedLevel: 10,
        prerequisites: [],
        rewards: ["100 XP"],
        preparation: ["1 Corde d’escalade"],
        actions: [
          { instruction: "Parlez à Ganymède.", position: "[-3,-3]", warning: null, combat: "NONE" },
          { instruction: "Rapportez-lui sa réponse.", position: null, warning: null, combat: "NONE" },
        ],
        notes: ["Gardez la Corde d’escalade"],
        npcs: ["Ganymède"],
        items: [{ name: "Corde d'escalade", itemId: 9935, imageUrl: "/items/9935.png", dofusDbUrl: "https://dofusdb.fr/fr/database/item/9935" }],
      },
    }];
    render(<ProgressProvider><QuestChecklist guideId={-1} stepNumber={6} quests={summarized} /></ProgressProvider>);

    const tutorial = screen.getByRole("button", { name: "Ouvrir le tutoriel" });
    expect(tutorial.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Parlez au PNJ puis rapportez sa réponse.")).toBeNull();
    await user.click(tutorial);
    expect(tutorial.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Parlez au PNJ puis rapportez sa réponse.")).toBeTruthy();
    expect(screen.getByText((_content, element) => element?.tagName === "P" && element.textContent === "Parlez à Ganymède.")).toBeTruthy();
    expect(screen.getAllByText("Corde d’escalade").every((element) => element.tagName === "STRONG")).toBe(true);
    const itemButtons = screen.getAllByRole("button", { name: "Copier Corde d'escalade" });
    expect(itemButtons).toHaveLength(2);
    await user.click(itemButtons[0]!);
    expect(await navigator.clipboard.readText()).toBe("Corde d'escalade");
    expect(document.querySelector('a[href*="dofusdb.fr/fr/database/item"]')).toBeNull();
    expect(document.querySelector('img[src="/items/9935.png"]')).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.queryByText("100 XP")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
    const generalInformation = screen.getByRole("button", { name: "Informations générales" });
    expect(generalInformation.getAttribute("aria-expanded")).toBe("false");
    await user.click(generalInformation);
    expect(generalInformation.getAttribute("aria-expanded")).toBe("true");
    const coordinates = screen.getAllByRole("button", { name: "Copier la commande /travel -3,-3" });
    await user.click(coordinates.at(-1)!);
    expect(await navigator.clipboard.readText()).toBe("/travel -3,-3");
    expect(screen.getByRole("link", { name: /Guide DofusPourLesNoobs/i }).getAttribute("href")).toBe(summarized[0]?.externalUrl);
    expect(screen.getByText("0/2")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Valider la sous-étape 1" }));
    expect(screen.getByText("1/2")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Valider Réponses à tout" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Valider la sous-étape 2" }));
    expect((screen.getByRole("checkbox", { name: "Valider Réponses à tout" }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => {
      const stored = localStorage.getItem("dofusguide.progress.v2");
      expect(stored).toContain('"tutorialActions"');
      expect(stored).toContain('"quest:898"');
      expect(stored).toContain('"COMPLETED"');
    });
  });

  it("ouvre le tutoriel par défaut sur grand écran", async () => {
    setDesktopViewport(true);
    render(<ProgressProvider><QuestChecklist guideId={-1} stepNumber={6} quests={[{
      ...quests[0]!,
      guideSummary: {
        sourceUrl: "https://www.dofuspourlesnoobs.com/reponses-a-tout.html",
        sourceTitle: "Réponses à tout",
        overview: "Tutoriel visible sur grand écran.",
        recommendedLevel: null,
        prerequisites: [],
        rewards: [],
        preparation: [],
        actions: [],
        notes: [],
        npcs: [],
        items: [],
      },
    }]} /></ProgressProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: "Replier le tutoriel" })).toBeTruthy());
    expect(screen.getByText("Tutoriel visible sur grand écran.")).toBeTruthy();
  });
});
