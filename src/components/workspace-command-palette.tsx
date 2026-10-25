"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export type CommandItem = { href: string; label: string; keywords?: string };
export function WorkspaceCommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  function close() {
    dialog.current?.close();
  }
  function show() {
    setQuery("");
    if (!dialog.current?.open) dialog.current?.showModal();
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else {
          setQuery("");
          dialog.current?.showModal();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const matches = useMemo(
    () =>
      items
        .filter((x) =>
          `${x.label} ${x.keywords ?? ""} ${x.href}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        )
        .slice(0, 12),
    [items, query],
  );
  const go = (href: string) => {
    close();
    router.push(href);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="portal-search-trigger"
        onClick={show}
        aria-label="Search workspace"
      >
        Search <kbd>⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="workspace-search-dialog"
        aria-label="Jump to workspace page"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), a[href]",
            ),
          ];
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="command-palette__panel">
          <div className="workspace-search-heading">
            <label htmlFor="workspace-jump">Jump to…</label>
            <button type="button" onClick={close} aria-label="Close search">
              Close
            </button>
          </div>
          <input
            id="workspace-jump"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) go(matches[0].href);
            }}
            placeholder="Search pages…"
          />
          <ul>
            {matches.map((x) => (
              <li key={x.href}>
                <button type="button" onClick={() => go(x.href)}>
                  <strong>{x.label}</strong>
                  <span>{x.href}</span>
                </button>
              </li>
            ))}
            {!matches.length ? <li>No matching pages</li> : null}
          </ul>
        </div>
      </dialog>
    </>
  );
}
