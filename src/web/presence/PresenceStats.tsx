import { Info, Server, Users } from "lucide-react";
import { usePresenceLocation } from "./PresenceProvider.js";

export function PresenceStats() {
  const presence = usePresenceLocation(null);
  return (
    <section className="flex max-w-full flex-wrap items-center gap-2 text-sm" aria-label="Présence sur le site">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-base-300 bg-base-100 px-3 py-1.5 shadow-sm">
        <Users className="text-primary" size={16} aria-hidden="true" />
        <strong className="tabular-nums">{presence.initialized ? presence.activeTotal : "…"}</strong>
        <span className="text-base-content/65">actif{presence.activeTotal > 1 ? "s" : ""}</span>
      </span>
      {presence.serverName && <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-base-300 bg-base-100 px-3 py-1.5 shadow-sm">
        <Server className="text-secondary" size={16} aria-hidden="true" />
        <strong className="tabular-nums">{presence.activeOnServer ?? "…"}</strong>
        <span className="text-base-content/65">sur {presence.serverName}</span>
      </span>}
      <span className="inline-flex items-center gap-1 text-xs text-base-content/45" title="Présence actualisée automatiquement chaque minute">
        <Info size={12} aria-hidden="true" /> actualisé chaque minute
      </span>
    </section>
  );
}
