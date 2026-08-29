declare const __CLOUDFLARE_WORKER__: boolean;

interface D1Result {
  meta: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  getByName(name: string): DurableObjectStub;
}

interface AssetsFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectState {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
  storage: {
    sql: {
      exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): {
        one(): T;
        toArray(): T[];
      };
    };
  };
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface ResponseInit {
  webSocket?: WebSocket | null;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ExportedHandler<Env> {
  fetch(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: unknown;

  export abstract class DurableObject<Env> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
    fetch(request: Request): Response | Promise<Response>;
    webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void | Promise<void>;
  }
}

interface CloudflareEnv {
  ASSETS: AssetsFetcher;
  USER_DB: D1Database;
  PROFILE_EVENTS: DurableObjectNamespace;
  SITE_PRESENCE: DurableObjectNamespace;
  GOOGLE_CLIENT_ID?: string;
  METAMOB_CREDENTIALS_KEY?: string;
}
