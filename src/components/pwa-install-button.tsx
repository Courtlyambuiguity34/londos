"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  return (
    <div className="pwa-install-action">
      <button
        className="button"
        type="button"
        disabled={!prompt || installed}
        onClick={async () => {
          if (!prompt) return;
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        {installed ? "Londos installed" : "Install Londos"}
      </button>
      {!prompt && !installed ? (
        <p>
          If this button is unavailable, use your browser menu and choose{" "}
          <strong>Install app</strong> or <strong>Add to Home Screen</strong>.
        </p>
      ) : null}
    </div>
  );
}
