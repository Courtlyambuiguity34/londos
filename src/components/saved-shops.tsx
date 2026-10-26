"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DiscoveryResult } from "@/server/discovery";
import { clearSavedShops, useSavedShops } from "@/modules/discovery/saved-store";
import { DiscoveryShopCard } from "./discovery-shop-card";
import { EmptyState } from "./empty-state";

export function SavedShops() {
  const ids = useSavedShops(),
    identity = JSON.stringify(ids);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    identity: string;
    results: DiscoveryResult[];
    error?: string;
  } | null>(null);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (identity === "[]") return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    void (async () => {
      try {
        const response = await fetch("/api/public/saved-shops", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: JSON.parse(identity) }),
        });
        if (!response.ok)
          throw Error(
            response.status === 429
              ? "Please wait a minute before trying again."
              : "Saved shops could not be loaded. Please try again.",
          );
        const value = (await response.json()) as { results: DiscoveryResult[] };
        if (!controller.signal.aborted) setResult({ identity, results: value.results });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            identity,
            results: [],
            error:
              error instanceof Error && error.name === "Error"
                ? error.message
                : "Saved shops could not be loaded. Check your connection and try again.",
          });
      }
    })();
    return () => controller.abort();
  }, [identity, retry]);
  const current = result?.identity === identity ? result : null;
  return (
    <>
      <div className="discovery-results-toolbar">
        <p>
          {ids.length} {ids.length === 1 ? "shop saved" : "shops saved"} on this browser
        </p>
        {ids.length ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              try {
                clearSavedShops();
                setStorageError("");
              } catch {
                setStorageError(
                  "This browser could not clear saved shops. Check your site storage settings.",
                );
              }
            }}
          >
            Clear saved shops
          </button>
        ) : null}
      </div>
      {storageError ? <p role="alert">{storageError}</p> : null}
      {!ids.length ? (
        <EmptyState
          title="Keep your favourites close."
          description="Tap the heart on a shop to find it here next time. No account needed. Saved shops stay on this browser."
          href="/search"
          action="Discover shops"
        />
      ) : !current ? (
        <p role="status">Checking your saved shops…</p>
      ) : current.error ? (
        <div role="alert" className="notice">
          <p>{current.error}</p>
          <button
            className="button button--outline"
            onClick={() => {
              setResult(null);
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {current.results.length ? (
            <div className="shop-grid discovery-grid">
              {current.results.map((shop) => (
                <DiscoveryShopCard key={shop.id} result={shop} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="These shops aren't available right now."
              description="A shop may be unpublished or temporarily unavailable. Your saved list stays here so you can try again later."
              href="/search"
              action="Discover more shops"
            />
          )}
          {current.results.length < ids.length ? (
            <p className="discovery-saved-note">
              Some saved shops are currently unavailable. Only shops available to the public appear
              here.
            </p>
          ) : null}
        </>
      )}
      <p className="discovery-saved-note">
        Clearing this browser's site data removes your saved list.{" "}
        <Link href="/privacy">Your privacy</Link>
      </p>
    </>
  );
}
