"use client";
import { useState } from "react";
import { Icon } from "./icon";

export function ShareShopButton({ path, title }: { path: string; title: string }) {
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  return (
    <div className="share-shop-control">
      <button
        className="save-shop-button"
        type="button"
        onClick={async () => {
          // Only public, server-generated paths are supplied. Never share previews,
          // current query strings, fragments, account URLs or bearer tokens.
          if (!/^\/shops\/[a-z0-9-]+(?:\/products\/[a-z0-9-]+)?$/.test(path)) {
            setMessage("This link cannot be shared.");
            return;
          }
          const url = new URL(path, window.location.origin).href;
          try {
            if (navigator.share) {
              await navigator.share({ title, url });
              setMessage("Share menu closed.");
              return;
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              setMessage("");
              return;
            }
            // A policy restriction may disable native sharing. Offer the same link.
          }
          try {
            await navigator.clipboard.writeText(url);
            setManual("");
            setMessage("Link copied. Share it wherever you like.");
          } catch {
            setManual(url);
            setMessage("Copy the link below to share it.");
          }
        }}
      >
        <Icon name="share" />
        <span>Share</span>
      </button>
      <span role="status" className="share-shop-feedback">
        {message}
      </span>
      {manual ? (
        <label className="share-shop-manual">
          Shop link
          <input readOnly value={manual} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : null}
    </div>
  );
}
