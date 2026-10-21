"use client";
import { useState, useSyncExternalStore } from "react";
import {
  installSnapshot,
  serverInstallSnapshot,
  subscribeInstall,
  updateInstall,
} from "@/modules/pwa/install-prompt";
export function PwaInstallButton() {
  const { prompt, installed } = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
    serverInstallSnapshot,
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="pwa-install-action">
      <button
        className="button"
        type="button"
        disabled={!prompt || installed || pending}
        onClick={async () => {
          if (!prompt) return;
          setPending(true);
          try {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            setMessage(
              choice.outcome === "accepted"
                ? "Installation requested. Follow your browser’s instructions to finish."
                : "You can install later from your browser menu.",
            );
          } catch {
            setMessage("Use your browser’s Install app or Add to Home Screen menu instead.");
          } finally {
            updateInstall(null);
            setPending(false);
          }
        }}
      >
        {installed ? "Londos is installed" : pending ? "Opening installation…" : "Install Londos"}
      </button>
      <p role="status">
        {message ||
          (!prompt && !installed
            ? "Use the instructions below if your browser does not offer an install button."
            : installed
              ? "Open Londos from your home screen or app launcher."
              : "Install for quick access. No app store is needed.")}
      </p>
    </div>
  );
}
