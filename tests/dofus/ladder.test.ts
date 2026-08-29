import { describe, expect, it, vi } from "vitest";
import { findDofusCharacter, parseDofusLadderCharacters } from "../../src/dofus/ladder.js";
import { DOFUS_SERVERS } from "../../src/dofus/servers.js";

const LADDER_HTML = `
  <table class="ak-ladder ak-container ak-table">
    <thead><tr><th>#</th><th>Nom</th><th>Classe</th><th>Serveur</th><th>Niveau</th><th>Points</th></tr></thead>
    <tbody>
      <tr class="ak-bg-odd">
        <td class="ak-rank"><span>45007</span></td>
        <td><span class="ak-breed-icon breed1_0"></span>Yukiix</td>
        <td class="ak-class">Feca</td><td>Dakal</td><td class="ak-level">139</td><td>3 866</td>
      </tr>
    </tbody>
  </table>`;

describe("DOFUS achievement ladder", () => {
  it("keeps the official server identifiers unique", () => {
    expect(new Set(DOFUS_SERVERS.map((server) => server.id)).size).toBe(DOFUS_SERVERS.length);
    expect(DOFUS_SERVERS).toContainEqual({ id: 353, name: "Dakal", category: "Pionnier monocompte" });
  });

  it("parses a character row and achievement points", () => {
    expect(parseDofusLadderCharacters(LADDER_HTML, 353)).toEqual([{
      name: "Yukiix", className: "Feca", serverId: 353, serverName: "Dakal", level: 139, achievementPoints: 3866,
    }]);
  });

  it("queries the selected server and matches the character case-insensitively", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(LADDER_HTML, { status: 200 }));
    await expect(findDofusCharacter("yukiix", 353, fetcher as typeof fetch)).resolves.toMatchObject({ name: "Yukiix", serverName: "Dakal" });
    const requested = new URL(String(fetcher.mock.calls[0]![0]));
    expect(requested.searchParams.get("server_id")).toBe("353");
    expect(requested.searchParams.get("name")).toBe("yukiix");
  });

  it("replays the request with the DOFUS bootstrap cookies", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (fetcher.mock.calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { "Set-Cookie": "LANG=fr; Path=/; SameSite=Lax, SID=session-id; Path=/; Secure; HttpOnly" },
        });
      }
      expect(init?.headers).toMatchObject({ Cookie: "LANG=fr; SID=session-id" });
      return new Response(LADDER_HTML, { status: 200 });
    });

    await expect(findDofusCharacter("Yukiix", 353, fetcher as typeof fetch)).resolves.toMatchObject({
      name: "Yukiix",
      serverName: "Dakal",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns null when the character is absent", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(LADDER_HTML, { status: 200 }));
    await expect(findDofusCharacter("Inconnu", 353, fetcher as typeof fetch)).resolves.toBeNull();
  });
});
