export interface SharedProfileImageData {
  name: string;
  server: string;
  className: string;
  level: number | null;
  success: number | null;
  step: number;
  total: number;
  completed: number;
  chapter: string;
  boss: string | null;
  dungeon: string | null;
  avatar: string;
  bossImage: string | null;
}

function shortText(url: URL, name: string, maximum: number): string {
  return (url.searchParams.get(name) ?? "").normalize("NFC").trim().slice(0, maximum);
}

function boundedInteger(url: URL, name: string, minimum: number, maximum: number): number | null {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function safeImageUrl(requestUrl: URL, value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin === requestUrl.origin && (url.protocol === "http:" || url.protocol === "https:")) return url.toString();
    const trustedHttpsOrigins = new Set([
      "https://dofusguideweb.com",
      "https://api.dofusdb.fr",
      "https://renderer.dofusdb.fr",
    ]);
    return url.protocol === "https:" && trustedHttpsOrigins.has(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseSharedProfileImageData(request: Request): SharedProfileImageData | null {
  const url = new URL(request.url);
  const name = shortText(url, "name", 40);
  const server = shortText(url, "server", 60);
  const className = shortText(url, "class", 60);
  const chapter = shortText(url, "chapter", 100);
  const step = boundedInteger(url, "step", 1, 10_000);
  const total = boundedInteger(url, "total", 1, 10_000);
  const completed = boundedInteger(url, "completed", 0, 10_000);
  const avatar = safeImageUrl(url, url.searchParams.get("avatar") ?? "");
  if (name === "" || server === "" || className === "" || chapter === ""
    || step === null || total === null || completed === null || avatar === null) return null;
  return {
    name,
    server,
    className,
    level: boundedInteger(url, "level", 1, 1_000),
    success: boundedInteger(url, "success", 0, 10_000_000),
    step,
    total,
    completed,
    chapter,
    boss: shortText(url, "boss", 80) || null,
    dungeon: shortText(url, "dungeon", 100) || null,
    avatar,
    bossImage: safeImageUrl(url, url.searchParams.get("bossImage") ?? ""),
  };
}
