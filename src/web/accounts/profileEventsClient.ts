import { useEffect, useRef } from "react";

function socketUrl(profileId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return protocol + "//" + window.location.host + "/api/realtime/profiles/" + encodeURIComponent(profileId);
}

export function useProfileEvents(profileIds: readonly string[], onUpdate: () => void): void {
  const profileKey = [...new Set(profileIds)].sort().join(",");
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (profileKey === "") return;
    const ids = profileKey.split(",");
    const sockets = new Map<string, WebSocket>();
    const reconnectTimers = new Map<string, number>();
    let stopped = false;

    const connect = (profileId: string, attempt = 0) => {
      if (stopped) return;
      const socket = new WebSocket(socketUrl(profileId));
      sockets.set(profileId, socket);
      socket.addEventListener("message", (event) => {
        if (event.data === "pong") return;
        onUpdateRef.current();
      });
      socket.addEventListener("close", () => {
        sockets.delete(profileId);
        if (stopped) return;
        const delay = Math.min(1_000 * 2 ** attempt, 30_000);
        reconnectTimers.set(profileId, window.setTimeout(() => connect(profileId, attempt + 1), delay));
      });
    };

    for (const profileId of ids) connect(profileId);
    const heartbeat = window.setInterval(() => {
      for (const socket of sockets.values()) {
        if (socket.readyState === WebSocket.OPEN) socket.send("ping");
      }
    }, 25_000);

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      for (const timer of reconnectTimers.values()) window.clearTimeout(timer);
      for (const socket of sockets.values()) socket.close(1000, "Component unmounted");
    };
  }, [profileKey]);
}
