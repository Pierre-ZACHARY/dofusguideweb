import handler from "@tanstack/react-start/server-entry";
import { D1AccountRepository } from "../accounts/d1AccountRepository.js";
import { DofusLadderUnavailableError, findDofusCharacter } from "../dofus/ladder.js";
import { getDofusServer } from "../dofus/servers.js";
import {
  parsePresenceLocation,
  parseQuestHelpObjective,
  type PresenceHeartbeatRequest,
  type PresenceInternalHeartbeat,
  type QuestHelperPresence,
} from "../presence/types.js";

export { ProfileEvents } from "./profileEvents.js";
export { SitePresence } from "./sitePresence.js";

const PROFILE_EVENTS_PREFIX = "/api/realtime/profiles/";
const DOFUS_CHARACTER_PATH = "/api/dofus/character";
const PRESENCE_PATH = "/api/presence";
const SESSION_COOKIE = "dofusguide_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHARACTER_NAME_PATTERN = /^[\p{L}\p{N}' -]{2,40}$/u;

function jsonResponse(body: unknown, status = 200, cacheControl = "no-store"): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
  });
}

async function dofusCharacterResponse(request: Request): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Méthode non autorisée" }, 405);
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.normalize("NFC").trim() ?? "";
  const serverId = Number(url.searchParams.get("serverId"));
  if (!CHARACTER_NAME_PATTERN.test(name) || !Number.isInteger(serverId) || getDofusServer(serverId) === null) {
    return jsonResponse({ error: "Nom ou serveur DOFUS invalide" }, 400);
  }
  try {
    const character = await findDofusCharacter(name, serverId);
    return jsonResponse(
      character === null ? { found: false } : { found: true, character },
      200,
      "public, max-age=120, s-maxage=600, stale-while-revalidate=3600",
    );
  } catch (error) {
    if (error instanceof DofusLadderUnavailableError) {
      return jsonResponse({ error: error.message }, 502, "public, max-age=30");
    }
    throw error;
  }
}

async function profileEventsResponse(request: Request, env: CloudflareEnv, profileId: string): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426 });
  }
  if (!UUID_PATTERN.test(profileId)) return new Response("Invalid profile", { status: 400 });
  const shared = await env.USER_DB.prepare("SELECT id FROM player_profiles WHERE id = ? AND share_token IS NOT NULL")
    .bind(profileId).first<{ id: string }>();
  if (shared === null) return new Response("Shared profile not found", { status: 404 });
  return env.PROFILE_EVENTS.getByName(profileId).fetch(new Request("https://profile-events.internal/connect", request));
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

async function presenceResponse(request: Request, env: CloudflareEnv): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) return jsonResponse({ error: "Requête trop volumineuse" }, 413);

  let body: PresenceHeartbeatRequest;
  try {
    body = await request.json() as PresenceHeartbeatRequest;
  } catch {
    return jsonResponse({ error: "Corps JSON invalide" }, 400);
  }
  if (typeof body.clientId !== "string" || !UUID_PATTERN.test(body.clientId)
    || typeof body.sessionId !== "string" || !UUID_PATTERN.test(body.sessionId)) {
    return jsonResponse({ error: "Identifiant de présence invalide" }, 400);
  }
  const location = body.location === null ? null : parsePresenceLocation(body.location);
  const help = body.help === null ? null : parseQuestHelpObjective(body.help);
  if (body.location !== null && location === null) return jsonResponse({ error: "Étape invalide" }, 400);
  if (body.help !== null && help === null) return jsonResponse({ error: "Quête invalide" }, 400);

  const repository = new D1AccountRepository(env.USER_DB);
  let serverId: number | null = null;
  let serverName: string | null = null;
  let viewerProfileId: string | null = null;
  let helper: QuestHelperPresence | null = null;
  try {
    const token = cookieValue(request, SESSION_COOKIE);
    const userId = token === null ? null : await repository.userIdForSession(token);
    const account = userId === null ? null : await repository.getAccount(userId);
    const profile = account?.profiles.find((candidate) => candidate.id === account.activeProfileId) ?? null;
    if (token !== null && userId !== null && profile !== null) {
      await repository.touchSessionPresence(token, userId, profile.id);
      viewerProfileId = profile.id;
      if (profile.serverId !== null && profile.serverName !== null && profile.dofusVerifiedAt !== null) {
        serverId = profile.serverId;
        serverName = profile.serverName;
      }
      if (help !== null) {
        if (serverId === null || serverName === null) {
          return jsonResponse({ error: "Vérifiez le personnage et son serveur avant de demander de l’aide" }, 400);
        }
        const shareToken = await repository.enableSharing(userId, profile.id);
        helper = {
          ...help,
          profileId: profile.id,
          shareToken,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          serverId,
          serverName,
        };
      }
    } else if (help !== null) {
      return jsonResponse({ error: "Connectez-vous avant de demander de l’aide" }, 401);
    }
  } finally {
    await repository.close();
  }

  const heartbeat: PresenceInternalHeartbeat = {
    clientId: body.clientId,
    sessionId: body.sessionId,
    location,
    help,
    serverId,
    serverName,
    viewerProfileId,
    helper,
  };
  const stub = env.SITE_PRESENCE.getByName("global");
  return stub.fetch("https://site-presence.internal/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(heartbeat),
  });
}

export default {
  async fetch(request: Request, env: CloudflareEnv, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.dofusguideweb.com") {
      url.hostname = "dofusguideweb.com";
      return Response.redirect(url, 308);
    }
    if (url.pathname.startsWith(PROFILE_EVENTS_PREFIX)) {
      const profileId = decodeURIComponent(url.pathname.slice(PROFILE_EVENTS_PREFIX.length));
      return profileEventsResponse(request, env, profileId);
    }
    if (url.pathname === DOFUS_CHARACTER_PATH) return dofusCharacterResponse(request);
    if (url.pathname === PRESENCE_PATH) return presenceResponse(request, env);
    return handler.fetch(request);
  },
} satisfies ExportedHandler<CloudflareEnv>;
