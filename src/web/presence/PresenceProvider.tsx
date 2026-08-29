import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parseQuestHelpObjective,
  sameHelpObjective,
  type PresenceHeartbeatRequest,
  type PresenceLocation,
  type PresenceSnapshot,
  type QuestHelpObjective,
} from "../../presence/types.js";
import { useAccount } from "../accounts/AccountProvider.js";

const CLIENT_ID_KEY = "dofusguide_presence_id";
const SESSION_ID_KEY = "dofusguide_presence_tab_id";
const HELP_KEY = "dofusguide_active_help";
const HEARTBEAT_INTERVAL_MS = 60_000;

interface StoredHelp extends QuestHelpObjective { profileId: string }

interface PresenceContextValue extends PresenceSnapshot {
  initialized: boolean;
  error: string | null;
  activeHelp: StoredHelp | null;
  canRequestHelp: boolean;
  setLocation: (location: PresenceLocation | null) => void;
  toggleHelp: (objective: QuestHelpObjective) => void;
  refresh: () => Promise<void>;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);
const EMPTY_SNAPSHOT: PresenceSnapshot = { activeTotal: 0, activeOnServer: null, serverName: null, helpers: [] };

function readStoredHelp(): StoredHelp | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(HELP_KEY) ?? "null") as unknown;
    const objective = parseQuestHelpObjective(value);
    if (objective === null || typeof value !== "object" || value === null || !("profileId" in value) || typeof value.profileId !== "string") return null;
    return { ...objective, profileId: value.profileId };
  } catch {
    return null;
  }
}

function clientPresenceId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(existing)) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

function tabPresenceId(): string {
  const existing = sessionStorage.getItem(SESSION_ID_KEY);
  if (existing !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(existing)) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

export function PresenceProvider({ children }: Readonly<{ children: ReactNode }>) {
  const account = useAccount();
  const [clientId, setClientId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [location, setLocation] = useState<PresenceLocation | null>(null);
  const [activeHelp, setActiveHelp] = useState<StoredHelp | null>(null);
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(EMPTY_SNAPSHOT);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClientId(clientPresenceId());
    setSessionId(tabPresenceId());
    setActiveHelp(readStoredHelp());
  }, []);

  const activeProfile = account.activeProfile;
  const canRequestHelp = activeProfile !== null
    && activeProfile.serverId !== null
    && activeProfile.serverName !== null
    && activeProfile.dofusVerifiedAt !== null;

  useEffect(() => {
    if (account.loading || activeHelp === null) return;
    if (activeProfile === null || activeHelp.profileId !== activeProfile.id) {
      sessionStorage.removeItem(HELP_KEY);
      setActiveHelp(null);
    }
  }, [account.loading, activeHelp, activeProfile?.id]);

  const refresh = useCallback(async () => {
    if (clientId === null || sessionId === null) return;
    const request: PresenceHeartbeatRequest = {
      clientId,
      sessionId,
      location,
      help: activeHelp === null ? null : {
        guideId: activeHelp.guideId,
        stepNumber: activeHelp.stepNumber,
        questKey: activeHelp.questKey,
        relation: activeHelp.relation,
        sortOrder: activeHelp.sortOrder,
      },
    };
    try {
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const value = await response.json() as PresenceSnapshot | { error?: string };
      if (!response.ok) throw new Error("error" in value && value.error ? value.error : "Présence momentanément indisponible");
      setSnapshot(value as PresenceSnapshot);
      setInitialized(true);
      setError(null);
    } catch (presenceError) {
      setInitialized(true);
      setError(presenceError instanceof Error ? presenceError.message : String(presenceError));
    }
  }, [activeHelp, clientId, sessionId, location?.guideId, location?.stepNumber, account.activeProfile?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, HEARTBEAT_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const toggleHelp = useCallback((objective: QuestHelpObjective) => {
    if (activeProfile === null || !canRequestHelp) return;
    setActiveHelp((current) => {
      const next = current?.profileId === activeProfile.id && sameHelpObjective(current, objective)
        ? null
        : { ...objective, profileId: activeProfile.id };
      if (next === null) sessionStorage.removeItem(HELP_KEY);
      else sessionStorage.setItem(HELP_KEY, JSON.stringify(next));
      return next;
    });
  }, [activeProfile?.id, canRequestHelp]);

  const value = useMemo<PresenceContextValue>(() => ({
    ...snapshot,
    initialized,
    error,
    activeHelp,
    canRequestHelp,
    setLocation,
    toggleHelp,
    refresh,
  }), [snapshot, initialized, error, activeHelp, canRequestHelp, refresh]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceContextValue {
  const value = useContext(PresenceContext);
  if (value === null) throw new Error("usePresence must be used inside PresenceProvider");
  return value;
}

export function useOptionalPresence(): PresenceContextValue | null {
  return useContext(PresenceContext);
}

export function usePresenceLocation(location: PresenceLocation | null): PresenceContextValue {
  const presence = usePresence();
  useEffect(() => {
    presence.setLocation(location);
    return () => presence.setLocation(null);
  }, [location?.guideId, location?.stepNumber]);
  return presence;
}
