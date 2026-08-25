import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { QuestDto } from "../data/models.js";
import { searchQuestsData } from "../data/serverFunctions.js";
import { QuestAvatar } from "./QuestAvatar.js";

export function SearchCommand({ compact = false }: Readonly<{ compact?: boolean }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuestDto[]>([]);
  const [loading, setLoading] = useState(false);

  function open() {
    dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function close() {
    dialogRef.current?.close();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialogRef.current?.open ? close() : open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const onOpen = () => open();
    window.addEventListener("dofusguide:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("dofusguide:search", onOpen);
    };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === "") {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchQuestsData({ data: { q: normalized, page: 1, limit: 8 } })
        .then((result) => {
          if (!cancelled) setResults(result.items);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return <>
    <button type="button" className={compact ? "btn btn-ghost btn-circle" : "btn btn-ghost btn-circle sm:btn-sm sm:w-auto sm:gap-2 sm:px-3"} onClick={open} aria-label="Rechercher une quête">
      <Search size={17} aria-hidden="true" />
      {!compact && <><span className="hidden sm:inline">Recherche</span><kbd className="kbd kbd-sm hidden md:inline-flex">Ctrl K</kbd></>}
    </button>
    <dialog ref={dialogRef} className="modal" onClose={() => setQuery("")}>
      <div className="modal-box max-w-2xl overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-base-300 p-4">
          <Search className="opacity-60" size={20} aria-hidden="true" />
          <input ref={inputRef} className="input input-ghost h-auto flex-1 border-0 p-0 text-lg focus:outline-none" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Rechercher une quête…" aria-label="Nom de la quête" />
          {loading && <span className="loading loading-spinner loading-sm" aria-label="Recherche en cours" />}
          <button type="button" className="btn btn-ghost btn-circle btn-sm" onClick={close} aria-label="Fermer la recherche"><X size={18} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {query.trim() === "" && <p className="p-6 text-center text-sm opacity-60">Saisissez le nom d’une quête. <kbd className="kbd kbd-sm">Esc</kbd> ferme cette fenêtre.</p>}
          {query.trim() !== "" && !loading && results.length === 0 && <div className="alert alert-info"><span>Aucune quête trouvée.</span></div>}
          {results.length > 0 && <ul className="menu gap-1 rounded-box">
            {results.map((quest) => <li key={quest.questKey}><Link to="/quests/$questKey" params={{ questKey: quest.questKey }} onClick={close} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <QuestAvatar src={quest.npcImageUrl} name={quest.npcName ?? quest.originalName ?? quest.questKey} />
              <span className="min-w-0"><span className="block truncate font-semibold">{quest.originalName ?? quest.questKey}</span><span className="block truncate text-xs opacity-65">{quest.npcName ?? "PNJ inconnu"}{quest.startMap ? " · " + quest.startMap : ""}</span></span>
              {quest.category && <span className="badge badge-outline badge-sm">{quest.category}</span>}
            </Link></li>)}
          </ul>}
        </div>
        <div className="flex justify-end border-t border-base-300 bg-base-200 p-3"><Link className="link link-primary text-sm" to="/quests" onClick={close}>Recherche avancée</Link></div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="Fermer la recherche">fermer</button></form>
    </dialog>
  </>;
}
