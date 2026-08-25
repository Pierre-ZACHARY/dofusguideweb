import { Link } from "@tanstack/react-router";
import { Compass, Focus, Home, PictureInPicture2, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { useDocumentOverlay } from "./DocumentOverlay.js";
import { SearchCommand } from "./SearchCommand.js";
import { ThemeController } from "./ThemeController.js";
import { AccountMenu } from "../accounts/AccountMenu.js";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const overlay = useDocumentOverlay();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="navbar sticky top-0 z-40 border-b border-base-300 bg-base-100/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl px-3 sm:px-6">
          <Link to="/" className="btn btn-ghost gap-2 px-2 text-lg">
            <Compass className="text-primary" aria-hidden="true" />
            <span>DofusGuide <span className="badge badge-primary badge-outline align-middle">WEB</span></span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <AccountMenu />
            <button
              type="button"
              className={"btn btn-ghost btn-sm gap-2 " + (overlay.active ? "btn-active text-primary" : "")}
              onClick={() => overlay.active ? overlay.close() : void overlay.open()}
              aria-label={overlay.active ? "Fermer le mode overlay" : "Ouvrir le guide en mode overlay"}
              aria-pressed={overlay.active}
              title={overlay.supported ? "Afficher le guide au-dessus du jeu" : "Disponible dans Chrome et Edge récents"}
            >
              {overlay.opening ? <span className="loading loading-spinner loading-xs" /> : <PictureInPicture2 size={17} aria-hidden="true" />}
              <span className="hidden sm:inline">Overlay</span>
            </button>
            <SearchCommand />
            <ThemeController />
          </div>
        </div>
      </header>
      {overlay.active ? (
        <main className="mx-auto grid w-full max-w-3xl flex-1 place-items-center px-4 py-8 pb-24 sm:px-6 lg:pb-10">
          <div className="card w-full border border-info/40 bg-base-100 shadow-md">
            <div className="card-body items-center text-center">
              <PictureInPicture2 className="h-10 w-10 text-info" aria-hidden="true" />
              <h1 className="card-title">Guide ouvert en mode overlay</h1>
              <p className="opacity-70">La progression reste synchronisée avec cet onglet.</p>
              <div className="card-actions mt-2 justify-center">
                <button type="button" className="btn btn-primary btn-sm gap-2" onClick={overlay.focus}><Focus size={16} aria-hidden="true" />Afficher l’overlay</button>
                <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={overlay.close}><X size={16} aria-hidden="true" />Fermer</button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-9 lg:pb-10">{children}</main>
      )}
      <footer className="footer footer-center border-t border-base-300 bg-base-100 px-4 py-5 pb-24 text-xs text-base-content/65 lg:pb-5">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>
            Données issues de <a className="link link-hover font-medium" href="https://dofusdb.fr/" target="_blank" rel="noreferrer">DofusDB</a>.
            {" "}Utilisation soumise à la <a className="link link-hover font-medium" href="https://api.dofusdb.fr/" target="_blank" rel="noreferrer">LPNC-IA 1.0</a>.
          </span>
          <span aria-hidden="true">·</span>
          <a className="link link-hover" href="https://policies.google.com/terms?hl=fr" target="_blank" rel="noreferrer">Conditions d’utilisation de Google</a>
          <span aria-hidden="true">·</span>
          <a className="link link-hover" href="https://policies.google.com/privacy?hl=fr" target="_blank" rel="noreferrer">Règles de confidentialité Google</a>
        </div>
      </footer>
      <nav className="dock z-40 border-t border-base-300 bg-base-100 lg:hidden" aria-label="Navigation mobile">
        <Link to="/" activeProps={{ className: "dock-active" }}><Home size={20} aria-hidden="true" /><span className="dock-label">Accueil</span></Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event("dofusguide:search"))}><Search size={20} aria-hidden="true" /><span className="dock-label">Recherche</span></button>
      </nav>
      {overlay.portal(children)}
      {overlay.error && <div className="toast toast-end toast-top z-[100]"><div className="alert alert-warning"><span>{overlay.error}</span></div></div>}
    </div>
  );
}
