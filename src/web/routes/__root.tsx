import { HeadContent, Link, Outlet, Scripts, createRootRoute, type ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, Compass } from "lucide-react";
import { AppShell } from "../components/AppShell.js";
import { themeBootScript } from "../components/ThemeController.js";
import { ProgressProvider } from "../progress/progressStore.js";
import { AccountProvider } from "../accounts/AccountProvider.js";
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f7e9d7" },
      { title: "DofusGuide Web — Guide communautaire Dofus" },
      { name: "description", content: "Suivez votre progression dans le guide communautaire Dofus, partagez votre profil et retrouvez les étapes, quêtes et donjons." },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:site_name", content: "DofusGuide Web" },
      { property: "og:title", content: "DofusGuide Web — Guide communautaire Dofus" },
      { property: "og:description", content: "Le guide communautaire pour progresser dans Dofus, suivre ses quêtes et partager son avancée." },
      { property: "og:url", content: "https://dofusguideweb.com/" },
      { property: "og:image", content: "https://dofusguideweb.com/social-preview.png" },
      { property: "og:image:width", content: "1728" },
      { property: "og:image:height", content: "907" },
      { property: "og:image:alt", content: "DofusGuide Web — Le guide communautaire pour progresser dans Dofus" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DofusGuide Web — Guide communautaire Dofus" },
      { name: "twitter:description", content: "Le guide communautaire pour progresser dans Dofus, suivre ses quêtes et partager son avancée." },
      { name: "twitter:image", content: "https://dofusguideweb.com/social-preview.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  component: () => <RootDocument><AccountProvider><ProgressProvider><AppShell><Outlet /></AppShell></ProgressProvider></AccountProvider></RootDocument>,
  errorComponent: AppError,
  notFoundComponent: () => <RootDocument><div className="hero min-h-screen"><div className="hero-content text-center"><div><Compass className="mx-auto mb-4 h-14 w-14 text-primary" /><h1 className="text-5xl font-bold">Chemin introuvable</h1><p className="py-6">Cette étape n’existe pas dans le carnet.</p><Link className="btn btn-primary" to="/">Retour à l’accueil</Link></div></div></div></RootDocument>,
});

function AppError({ error, reset }: ErrorComponentProps) { return <RootDocument><div className="mx-auto grid min-h-screen max-w-xl place-items-center p-6"><div className="alert alert-error items-start"><AlertTriangle /><div><h1 className="font-bold">Impossible d’ouvrir le carnet</h1><p className="text-sm">{error.message}</p><button className="btn btn-sm mt-3" onClick={reset}>Réessayer</button></div></div></div></RootDocument>; }

function RootDocument({ children }: Readonly<{ children: ReactNode }>) { return <html lang="fr" data-theme="cupcake" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /><HeadContent /></head><body suppressHydrationWarning>{children}<Scripts /></body></html>; }
