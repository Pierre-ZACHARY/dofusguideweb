import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, X } from "lucide-react";

interface PictureInPictureOptions {
  width: number;
  height: number;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPictureApi {
  window: Window | null;
  requestWindow: (options: PictureInPictureOptions) => Promise<Window>;
}

type WindowWithDocumentPictureInPicture = Window & {
  documentPictureInPicture?: DocumentPictureInPictureApi;
};

const DocumentOverlayEnvironment = createContext(false);

export function useDocumentOverlayEnvironment(): boolean {
  return useContext(DocumentOverlayEnvironment);
}

function pictureInPictureApi(): DocumentPictureInPictureApi | null {
  if (typeof window === "undefined") return null;
  return (window as WindowWithDocumentPictureInPicture).documentPictureInPicture ?? null;
}

export function supportsDocumentPictureInPicture(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null) return false;
  return typeof (candidate as Partial<DocumentPictureInPictureApi>).requestWindow === "function";
}

function preparePictureInPictureDocument(pipWindow: Window): HTMLDivElement {
  const pipDocument = pipWindow.document;
  pipDocument.title = "DofusGuide [WEB] — Overlay";
  pipDocument.documentElement.lang = document.documentElement.lang;
  pipDocument.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") ?? "cupcake");

  const base = pipDocument.createElement("base");
  base.href = document.baseURI;
  pipDocument.head.append(base);
  document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach((node) => {
    pipDocument.head.append(node.cloneNode(true));
  });

  pipDocument.body.className = "min-h-screen bg-base-200 text-base-content";
  const container = pipDocument.createElement("div");
  container.id = "dofusguide-overlay-root";
  pipDocument.body.append(container);
  return container;
}

export interface DocumentOverlayController {
  active: boolean;
  supported: boolean;
  opening: boolean;
  error: string | null;
  open: () => Promise<void>;
  close: () => void;
  focus: () => void;
  portal: (children: ReactNode) => ReactNode;
}

export function useDocumentOverlay(): DocumentOverlayController {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [supported, setSupported] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayWindow = useRef<Window | null>(null);
  const themeObserver = useRef<MutationObserver | null>(null);

  const release = useCallback(() => {
    themeObserver.current?.disconnect();
    themeObserver.current = null;
    overlayWindow.current = null;
    setContainer(null);
  }, []);

  const close = useCallback(() => {
    const current = overlayWindow.current;
    release();
    if (current && !current.closed) current.close();
  }, [release]);

  const focus = useCallback(() => {
    if (overlayWindow.current && !overlayWindow.current.closed) overlayWindow.current.focus();
  }, []);

  const open = useCallback(async () => {
    const api = pictureInPictureApi();
    if (!api) {
      setError("Le mode overlay nécessite une version récente de Chrome ou Edge.");
      return;
    }
    if (api.window && !api.window.closed) {
      api.window.focus();
      return;
    }

    setOpening(true);
    setError(null);
    try {
      const pipWindow = await api.requestWindow({ width: 520, height: 760, preferInitialWindowPlacement: false });
      const portalContainer = preparePictureInPictureDocument(pipWindow);
      overlayWindow.current = pipWindow;
      pipWindow.addEventListener("pagehide", release, { once: true });

      const syncTheme = () => pipWindow.document.documentElement.setAttribute(
        "data-theme",
        document.documentElement.getAttribute("data-theme") ?? "cupcake",
      );
      themeObserver.current = new MutationObserver(syncTheme);
      themeObserver.current.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      setContainer(portalContainer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d’ouvrir le mode overlay.");
      release();
    } finally {
      setOpening(false);
    }
  }, [release]);

  useEffect(() => {
    setSupported(pictureInPictureApi() !== null);
    return close;
  }, [close]);

  useEffect(() => {
    if (error === null) return;
    const timeout = window.setTimeout(() => setError(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const portal = useCallback((children: ReactNode): ReactNode => {
    if (container === null) return null;
    return createPortal(
      <DocumentOverlayEnvironment.Provider value>
      <div className="flex min-h-screen flex-col bg-base-200 text-base-content">
        <header className="navbar sticky top-0 z-40 min-h-12 border-b border-base-300 bg-base-100/95 px-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 font-bold"><Compass size={18} className="text-primary" aria-hidden="true" />DofusGuide <span className="badge badge-primary badge-outline badge-sm">WEB</span></div>
          <button type="button" className="btn btn-ghost btn-sm btn-circle ml-auto" onClick={close} aria-label="Fermer le mode overlay"><X size={18} aria-hidden="true" /></button>
        </header>
        <main className="w-full flex-1 p-3 sm:p-4">{children}</main>
      </div>
      </DocumentOverlayEnvironment.Provider>,
      container,
    );
  }, [close, container]);

  return { active: container !== null, supported, opening, error, open, close, focus, portal };
}
