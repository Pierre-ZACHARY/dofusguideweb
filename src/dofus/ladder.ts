import { getDofusServer } from "./servers.js";

const LADDER_URL = "https://www.dofus.com/fr/mmorpg/communaute/ladder/succes";
const REQUEST_TIMEOUT_MS = 8_000;

export interface DofusCharacter {
  name: string;
  className: string;
  serverId: number;
  serverName: string;
  level: number;
  achievementPoints: number;
}

export class DofusLadderUnavailableError extends Error {
  constructor(message = "Le ladder DOFUS est momentanément indisponible") {
    super(message);
    this.name = "DofusLadderUnavailableError";
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const numeric = code[1]?.toLowerCase() === "x"
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });
}

function cellText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/gu, " ")).replace(/\s+/gu, " ").trim();
}

function parseNumber(value: string): number | null {
  const numeric = Number.parseInt(value.replace(/\D/gu, ""), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function comparableName(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("fr");
}

function bootstrapCookieHeader(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) return null;
  const cookies = [...setCookie.matchAll(/(?:^|,\s*)(LANG|SID)=([^;,]+)/giu)]
    .map((match) => `${match[1]}=${match[2]}`);
  return cookies.length === 0 ? null : cookies.join("; ");
}

export function parseDofusLadderCharacters(html: string, serverId: number): DofusCharacter[] {
  const configuredServer = getDofusServer(serverId);
  if (configuredServer === null) return [];
  const table = html.match(/<table\b[^>]*class=["'][^"']*\bak-ladder\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/iu)?.[1] ?? "";
  const characters: DofusCharacter[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((cell) => cellText(cell[1]!));
    if (cells.length < 6) continue;
    const level = parseNumber(cells[4]!);
    const achievementPoints = parseNumber(cells[5]!);
    if (level === null || achievementPoints === null || cells[1] === "" || cells[2] === "") continue;
    if (comparableName(cells[3]!) !== comparableName(configuredServer.name)) continue;
    characters.push({
      name: cells[1]!,
      className: cells[2]!,
      serverId: configuredServer.id,
      serverName: configuredServer.name,
      level,
      achievementPoints,
    });
  }
  return characters;
}

export async function findDofusCharacter(
  name: string,
  serverId: number,
  fetcher: typeof fetch = fetch,
): Promise<DofusCharacter | null> {
  const server = getDofusServer(serverId);
  if (server === null) throw new Error("Serveur DOFUS inconnu");
  const normalizedName = name.normalize("NFC").trim();
  if (normalizedName.length < 2 || normalizedName.length > 40) throw new Error("Nom de personnage DOFUS invalide");

  const url = new URL(LADDER_URL);
  url.searchParams.set("server_id", String(server.id));
  url.searchParams.set("name", normalizedName);
  url.searchParams.set("_pjax", "div.ak-main-page");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "User-Agent": "Mozilla/5.0 (compatible; DofusGuideWeb/1.0; +https://dofusguideweb.com)",
    "X-PJAX": "true",
    "X-PJAX-Container": "div.ak-main-page",
  };
  try {
    let response = await fetcher(url, { headers, signal: controller.signal });
    if (response.status === 302) {
      const cookie = bootstrapCookieHeader(response);
      if (cookie !== null) {
        response = await fetcher(url, { headers: { ...headers, Cookie: cookie }, signal: controller.signal });
      }
    }
    if (!response.ok) throw new DofusLadderUnavailableError();
    const characters = parseDofusLadderCharacters(await response.text(), server.id);
    return characters.find((character) => comparableName(character.name) === comparableName(normalizedName)) ?? null;
  } catch (error) {
    if (error instanceof DofusLadderUnavailableError) throw error;
    throw new DofusLadderUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
