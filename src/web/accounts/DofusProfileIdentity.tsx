import { useEffect, useState } from "react";
import type { PlayerProfile } from "../../accounts/types.js";
import type { DofusCharacter } from "../../dofus/ladder.js";

type DofusProfileReference = Pick<PlayerProfile, "name" | "serverId" | "serverName">;

type IdentityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; character: DofusCharacter }
  | { status: "unavailable" };

function useDofusProfileIdentity(profile: DofusProfileReference): IdentityState {
  const [state, setState] = useState<IdentityState>({ status: "idle" });

  useEffect(() => {
    if (profile.serverId === null) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ name: profile.name, serverId: String(profile.serverId) });
    setState({ status: "loading" });
    void fetch("/api/dofus/character?" + query, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("ladder unavailable");
        return response.json() as Promise<{ found: boolean; character?: DofusCharacter }>;
      })
      .then((result) => {
        setState(result.found && result.character
          ? { status: "available", character: result.character }
          : { status: "unavailable" });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [profile.name, profile.serverId]);

  return state;
}

export function DofusProfileSummary({
  profile,
  className = "text-xs opacity-70",
}: Readonly<{ profile: DofusProfileReference; className?: string }>) {
  const identity = useDofusProfileIdentity(profile);
  const serverName = profile.serverName ?? "DOFUS";
  if (profile.serverId === null) return <p className={className}>Serveur non renseigné</p>;
  if (identity.status === "idle" || identity.status === "loading") {
    return <p className={className} aria-live="polite">{serverName} · chargement du ladder…</p>;
  }
  if (identity.status === "unavailable") {
    return <p className={className}>{serverName} · ladder indisponible</p>;
  }
  const { character } = identity;
  return (
    <p className={className}>
      {character.className} · {character.serverName} · niv. {character.level} · {character.achievementPoints.toLocaleString("fr-FR")} pts de succès
    </p>
  );
}

export function DofusProfileStats({ profile }: Readonly<{ profile: DofusProfileReference }>) {
  const identity = useDofusProfileIdentity(profile);
  if (profile.serverId === null) {
    return <div className="stat px-6 py-4"><div className="stat-title">Personnage DOFUS</div><div className="stat-desc">Serveur non renseigné</div></div>;
  }
  if (identity.status === "idle" || identity.status === "loading") {
    return <div className="stat px-6 py-4" aria-live="polite"><div className="stat-title">Ladder DOFUS</div><div className="stat-desc">Chargement…</div></div>;
  }
  if (identity.status === "unavailable") {
    return <div className="stat px-6 py-4"><div className="stat-title">Ladder DOFUS</div><div className="stat-desc">Momentanément indisponible</div></div>;
  }
  const { character } = identity;
  return (
    <>
      <div className="stat px-6 py-4">
        <div className="stat-title">Niveau DOFUS</div>
        <div className="stat-value text-secondary">{character.level}</div>
        <div className="stat-desc">{character.className} · {character.serverName}</div>
      </div>
      <div className="stat px-6 py-4">
        <div className="stat-title">Points de succès</div>
        <div className="stat-value text-secondary">{character.achievementPoints.toLocaleString("fr-FR")}</div>
      </div>
    </>
  );
}
