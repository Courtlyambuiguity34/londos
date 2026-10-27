"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "./icon";

export function DesignProposalPreview({
  proposalHref,
  draftHref,
}: {
  proposalHref: string;
  draftHref?: string;
}) {
  const [open, setOpen] = useState(false),
    [version, setVersion] = useState("proposal"),
    [device, setDevice] = useState("desktop"),
    [loading, setLoading] = useState(true);
  const source = version === "draft" && draftHref ? draftHref : proposalHref;
  const stage = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useEffect(() => {
    if (!open || !stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [open]);
  const canvasWidth = device === "desktop" ? 1100 : 390,
    scale = Math.min(1, width / canvasWidth);
  return (
    <section className="assistant-preview" aria-label="Design preview studio">
      <div className="assistant-preview-heading">
        <div>
          <p className="workspace-eyebrow">See it before you save it</p>
          <h2>Your preview studio</h2>
          <p>Try the phone and desktop views. This does not change your live shop.</p>
        </div>
        <button
          type="button"
          className="button button--outline"
          onClick={() => {
            if (!open) setLoading(true);
            setOpen(!open);
          }}
        >
          {open ? "Hide inline preview" : "Preview here"}
        </button>
      </div>
      {open ? (
        <>
          <div className="assistant-preview-toolbar">
            <div role="group" aria-label="Preview version">
              <button
                type="button"
                aria-pressed={version === "proposal"}
                onClick={() => {
                  if (version === "proposal") return;
                  setVersion("proposal");
                  setLoading(true);
                }}
              >
                Proposal
              </button>
              {draftHref ? (
                <button
                  type="button"
                  aria-pressed={version === "draft"}
                  onClick={() => {
                    if (version === "draft") return;
                    setVersion("draft");
                    setLoading(true);
                  }}
                >
                  Saved draft
                </button>
              ) : null}
            </div>
            <div role="group" aria-label="Preview device">
              <button
                type="button"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                Desktop
              </button>
              <button
                type="button"
                aria-pressed={device === "phone"}
                onClick={() => setDevice("phone")}
              >
                Phone
              </button>
            </div>
            <Link prefetch={false} href={source} target="_blank" rel="noopener noreferrer">
              Open full preview <Icon name="external" />
            </Link>
          </div>
          {loading ? (
            <p className="assistant-preview-loading">
              Loading your private preview… If it cannot open, reload the assistant or use the full
              preview link.
            </p>
          ) : null}
          <div ref={stage} className={`assistant-preview-stage assistant-preview-stage--${device}`}>
            <div
              className="assistant-preview-canvas"
              style={{ width: canvasWidth * scale, height: 680 }}
            >
              <iframe
                key={source}
                title={version === "draft" ? "Saved draft preview" : "Proposed storefront preview"}
                src={source}
                onLoad={() => setLoading(false)}
                referrerPolicy="no-referrer"
                sandbox="allow-same-origin allow-scripts allow-popups"
                style={{
                  width: canvasWidth,
                  height: 680 / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="assistant-preview-placeholder">
          <span aria-hidden="true">
            <Icon name="shop" />
          </span>
          <p>A real preview of your shop, with your catalogue and images.</p>
          <p>Open it here, compare it with your saved draft, then decide what to keep.</p>
        </div>
      )}
    </section>
  );
}
