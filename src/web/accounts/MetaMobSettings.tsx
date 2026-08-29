import { ExternalLink, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useProgress } from "../progress/progressStore.js";
import { useAccount } from "./AccountProvider.js";

function localArchmonsterCount(keys: Record<string, true> | undefined): number {
  return Object.keys(keys ?? {}).filter((key) => {
    try {
      const value = JSON.parse(key) as unknown;
      return Array.isArray(value) && value[0] === "ARCHMONSTER";
    } catch { return false; }
  }).length;
}

export function MetaMobSettings() {
  const account = useAccount();
  const { profile } = useProgress();
  const [apiKey, setApiKey] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const metaMob = account.metaMob;
  const localCount = localArchmonsterCount(profile.bestiaryObjectives);
  const remoteCount = metaMob?.archmonsters.filter((monster) => monster.quantity > 0).length ?? 0;
  const selectedQuest = useMemo(() => metaMob?.quests.find((quest) => quest.slug === selectedSlug) ?? null, [metaMob?.quests, selectedSlug]);

  useEffect(() => {
    if (metaMob?.link) setSelectedSlug(metaMob.link.questSlug);
    else if (metaMob?.quests.length === 1) setSelectedSlug(metaMob.quests[0]!.slug);
  }, [metaMob?.link?.questSlug, metaMob?.quests]);

  async function configure(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await account.configureMetaMob(apiKey);
      setApiKey("");
    } finally {
      setPending(false);
    }
  }

  async function link(strategy: "IMPORT_METAMOB" | "EXPORT_LOCAL") {
    if (!selectedSlug) return;
    setPending(true);
    try {
      await account.linkMetaMob(selectedSlug, strategy);
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><ShieldCheck size={17} />Synchronisation MetaMob</h3>
        <p className="mt-1 text-sm opacity-65">La clé API est chiffrée sur le serveur et n’est jamais réaffichée.</p>
      </div>
      {!metaMob?.configured ? (
        <form className="grid gap-3 rounded-box border border-base-300 p-4" onSubmit={(event) => void configure(event)}>
          <div className="text-sm">
            La quête sera recherchée avec le personnage <strong>{account.activeProfile?.name}</strong>
            {account.activeProfile?.serverName ? <> sur <strong>{account.activeProfile.serverName}</strong></> : null}.
          </div>
          <label className="form-control gap-1">
            <span className="label-text text-sm font-semibold">Clé API MetaMob</span>
            <input className="input input-bordered w-full" value={apiKey} onChange={(event) => setApiKey(event.currentTarget.value)} required minLength={20} type="password" autoComplete="off" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending || account.metaMobLoading} type="submit">
              {(pending || account.metaMobLoading) && <span className="loading loading-spinner loading-xs" />}Connecter MetaMob
            </button>
            <a className="link text-sm" href="https://www.metamob.fr/settings" target="_blank" rel="noreferrer">Générer une clé API <ExternalLink size={13} className="inline" /></a>
          </div>
        </form>
      ) : (
        <div className="space-y-3 rounded-box border border-base-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><span className="font-semibold">Recherche automatique :</span> {metaMob.lookupName}{account.activeProfile?.serverName ? " · " + account.activeProfile.serverName : ""}</p>
            <button className="btn btn-ghost btn-xs gap-1" type="button" disabled={account.metaMobLoading} onClick={() => void account.refreshMetaMob()}>
              <RefreshCw size={13} />Actualiser
            </button>
          </div>
          <label className="form-control gap-1">
            <span className="label-text text-sm font-semibold">Personnage / quête MetaMob</span>
            <select className="select select-bordered w-full" value={selectedSlug} onChange={(event) => { setSelectedSlug(event.currentTarget.value); setConfirming(false); }}>
              <option value="">Sélectionner un personnage…</option>
              {metaMob.quests.map((quest) => (
                <option value={quest.slug} key={quest.slug}>{quest.characterName} · {quest.serverName}</option>
              ))}
            </select>
          </label>
          {metaMob.quests.length === 0 && <div className="alert alert-info text-sm"><span>Aucune quête publique correspondant exactement à ce personnage et ce serveur n’a été trouvée. L’API MetaMob ne permet pas encore de créer une quête : créez-la sur MetaMob, rendez-la publique, puis actualisez ici.</span></div>}
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-outline btn-sm gap-1" href="https://www.metamob.fr/quests" target="_blank" rel="noreferrer"><ExternalLink size={14} />Créer une quête sur MetaMob</a>
            {selectedQuest && metaMob.link?.questSlug !== selectedQuest.slug && (
              <button className="btn btn-primary btn-sm gap-1" type="button" onClick={() => setConfirming(true)}><Link2 size={14} />Associer à ce profil</button>
            )}
            {metaMob.link && <button className="btn btn-ghost btn-sm gap-1" type="button" onClick={() => void account.unlinkMetaMob()}><Unlink size={14} />Dissocier</button>}
          </div>
          {metaMob.link && <div className="alert alert-success text-sm"><span><strong>{metaMob.link.characterName}</strong> est la source de vérité pour les archimonstres de ce profil ({remoteCount} capturé{remoteCount > 1 ? "s" : ""}).</span></div>}
          {confirming && selectedQuest && (
            <div className="alert alert-warning block space-y-3 text-sm" role="alert">
              <p><strong>Choisissez le sens de la première synchronisation.</strong> Cette opération remplace uniquement les coches d’archimonstres, pas les quêtes ni les autres objectifs.</p>
              <p>Progression locale : {localCount} archimonstre{localCount > 1 ? "s" : ""} coché{localCount > 1 ? "s" : ""}. La progression MetaMob sera lue avant l’association.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-warning btn-sm" disabled={pending} type="button" onClick={() => void link("IMPORT_METAMOB")}>Importer MetaMob et remplacer le local</button>
                <button className="btn btn-outline btn-sm" disabled={pending} type="button" onClick={() => void link("EXPORT_LOCAL")}>Envoyer le local vers MetaMob</button>
                <button className="btn btn-ghost btn-sm" disabled={pending} type="button" onClick={() => setConfirming(false)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
