import { useEffect, useRef, useState } from "react";
import type { StoredProgressProfile } from "../../accounts/types.js";
import { getGoogleAuthConfig } from "./serverFunctions.js";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  prompt: () => void;
  cancel: () => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Impossible de charger Google Identity Services")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger Google Identity Services"));
    document.head.append(script);
  });
  return scriptPromise;
}

export function GoogleOneTap({
  localProgress,
  onCredential,
  buttonHost,
}: Readonly<{
  localProgress: StoredProgressProfile;
  onCredential: (credential: string, localProgress: StoredProgressProfile) => Promise<void>;
  buttonHost: HTMLElement | null;
}>) {
  const progressRef = useRef(localProgress);
  const callbackRef = useRef(onCredential);
  const [configured, setConfigured] = useState<boolean | null>(null);
  progressRef.current = localProgress;
  callbackRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    let promptInitialized = false;
    void getGoogleAuthConfig().then(async (config) => {
      if (cancelled) return;
      setConfigured(config.enabled);
      if (!config.enabled) return;
      await loadGoogleScript();
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: (response) => {
          void callbackRef.current(response.credential, progressRef.current).catch(() => {
            // AccountProvider exposes the actionable error in the global account UI.
          });
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      promptInitialized = true;
      window.google.accounts.id.prompt();
    }).catch(() => setConfigured(false));
    return () => {
      cancelled = true;
      if (promptInitialized) window.google?.accounts.id.cancel();
    };
  }, []);

  useEffect(() => {
    if (!buttonHost || configured !== true || !window.google) return;
    buttonHost.replaceChildren();
    window.google.accounts.id.renderButton(buttonHost, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      locale: "fr",
      width: 250,
    });
  }, [buttonHost, configured]);

  useEffect(() => {
    if (!buttonHost || configured !== false) return;
    const warning = document.createElement("div");
    warning.className = "alert alert-warning text-sm";
    warning.textContent = "Définissez GOOGLE_CLIENT_ID pour activer Google One Tap.";
    buttonHost.replaceChildren(warning);
  }, [buttonHost, configured]);

  return null;
}
