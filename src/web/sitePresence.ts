import { DurableObject } from "cloudflare:workers";
import {
  parsePresenceLocation,
  type PresenceInternalHeartbeat,
  type PresenceSnapshot,
  type QuestHelperPresence,
} from "../presence/types.js";

const PRESENCE_WINDOW_MS = 5 * 60 * 1_000;

interface CountRow { count: number }
interface HelperRow { helper_json: string }

function parseStoredHelper(value: string): QuestHelperPresence | null {
  try {
    const parsed = JSON.parse(value) as QuestHelperPresence;
    return parsePresenceLocation(parsed) === null || typeof parsed.profileId !== "string" || typeof parsed.shareToken !== "string"
      ? null
      : parsed;
  } catch {
    return null;
  }
}

export class SitePresence extends DurableObject<CloudflareEnv> {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS site_presence_v2 (
        session_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        seen_at INTEGER NOT NULL,
        server_id INTEGER,
        helper_json TEXT
      )
    `);
    this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS site_presence_v2_server_idx ON site_presence_v2(server_id, seen_at)");
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/heartbeat" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    const heartbeat = await request.json() as PresenceInternalHeartbeat;
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM site_presence_v2 WHERE seen_at < ?", now - PRESENCE_WINDOW_MS);
    sql.exec(`
      INSERT INTO site_presence_v2 (session_id, client_id, seen_at, server_id, helper_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        client_id = excluded.client_id,
        seen_at = excluded.seen_at,
        server_id = excluded.server_id,
        helper_json = excluded.helper_json
    `, heartbeat.sessionId, heartbeat.clientId, now, heartbeat.serverId, heartbeat.helper === null ? null : JSON.stringify(heartbeat.helper));

    const activeTotal = sql.exec<CountRow>("SELECT COUNT(DISTINCT client_id) AS count FROM site_presence_v2").one().count;
    let activeOnServer: number | null = null;
    let helpers: QuestHelperPresence[] = [];
    if (heartbeat.serverId !== null) {
      activeOnServer = sql.exec<CountRow>(
        "SELECT COUNT(DISTINCT client_id) AS count FROM site_presence_v2 WHERE server_id = ?",
        heartbeat.serverId,
      ).one().count;
      if (heartbeat.location !== null) {
        helpers = sql.exec<HelperRow>(`
          SELECT helper_json FROM site_presence_v2
          WHERE server_id = ? AND helper_json IS NOT NULL
        `, heartbeat.serverId).toArray()
          .map((row) => parseStoredHelper(row.helper_json))
          .filter((helper): helper is QuestHelperPresence => helper !== null)
          .filter((helper) => helper.guideId === heartbeat.location!.guideId && helper.stepNumber === heartbeat.location!.stepNumber);
      }
    }

    return Response.json({
      activeTotal,
      activeOnServer,
      serverName: heartbeat.serverName,
      helpers,
    } satisfies PresenceSnapshot, { headers: { "Cache-Control": "no-store" } });
  }
}
