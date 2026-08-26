import handler from "@tanstack/react-start/server-entry";

export { ProfileEvents } from "./profileEvents.js";

const PROFILE_EVENTS_PREFIX = "/api/realtime/profiles/";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
    return handler.fetch(request);
  },
} satisfies ExportedHandler<CloudflareEnv>;
