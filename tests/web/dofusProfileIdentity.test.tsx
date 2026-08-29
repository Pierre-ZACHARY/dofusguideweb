// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DofusProfileStats, DofusProfileSummary } from "../../src/web/accounts/DofusProfileIdentity.js";

const profile = { name: "Yukiix", serverId: 353, serverName: "Dakal" };
const character = {
  name: "Yukiix",
  className: "Feca",
  serverId: 353,
  serverName: "Dakal",
  level: 143,
  achievementPoints: 4029,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DOFUS profile identity", () => {
  it("shows the ladder identity next to a profile", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({ found: true, character }));
    vi.stubGlobal("fetch", fetcher);

    render(<DofusProfileSummary profile={profile} />);

    expect(await screen.findByText("Feca · Dakal · niv. 143 · 4 029 pts de succès")).toBeTruthy();
    const requested = new URL(String(fetcher.mock.calls[0]![0]), "https://dofusguideweb.com");
    expect(requested.pathname).toBe("/api/dofus/character");
    expect(requested.searchParams.get("name")).toBe("Yukiix");
    expect(requested.searchParams.get("serverId")).toBe("353");
  });

  it("shows level and achievement points as public profile stats", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: true, character })));

    render(<div className="stats"><DofusProfileStats profile={profile} /></div>);

    expect(await screen.findByText("Niveau DOFUS")).toBeTruthy();
    expect(screen.getByText("143")).toBeTruthy();
    expect(screen.getByText("Points de succès")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("4 029")).toBeTruthy());
  });
});
