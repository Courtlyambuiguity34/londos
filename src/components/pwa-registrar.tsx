"use client";

import { useEffect } from "react";
import { updateInstall, type InstallPromptEvent } from "@/modules/pwa/install-prompt";

export function PwaRegistrar() {
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      updateInstall(event as InstallPromptEvent);
    };
    const installed = () => updateInstall(null, true);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone
    )
      installed();
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The site remains usable in the browser when installation is unavailable.
      });
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return null;
}
