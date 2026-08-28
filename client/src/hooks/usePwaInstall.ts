import { useCallback, useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let listenersAttached = false;
const subscribers = new Set<() => void>();

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

if (typeof window !== "undefined") {
  installed = isStandaloneMode();
}

function notifySubscribers() {
  subscribers.forEach(subscriber => subscriber());
}

function attachWindowListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  window.addEventListener("beforeinstallprompt", event => {
    if (installed) return;
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notifySubscribers();
  });
}

if (typeof window !== "undefined") {
  attachWindowListeners();
}

export function usePwaInstall() {
  const [, refresh] = useState(0);

  useEffect(() => {
    attachWindowListeners();
    const subscriber = () => refresh(value => value + 1);
    subscribers.add(subscriber);
    refresh(value => value + 1);

    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const prompt = deferredPrompt;
    if (!prompt) return "unavailable";

    // The browser permits prompt() only once for each beforeinstallprompt event.
    // Clear the shared reference before calling it so another visible CTA cannot
    // consume the same event while the native prompt is open.
    deferredPrompt = null;
    notifySubscribers();

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installed = true;
      }
      notifySubscribers();
      return choice.outcome;
    } catch {
      // Some browsers reject prompt() when the event is stale or already used.
      // Returning unavailable lets the caller show the manual instructions.
      notifySubscribers();
      return "unavailable";
    }
  }, []);

  return {
    install,
    isInstalled: installed,
    isInstallable: Boolean(deferredPrompt),
  };
}
