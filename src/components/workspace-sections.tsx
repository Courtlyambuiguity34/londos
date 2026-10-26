"use client";
import { useId, useCallback, useSyncExternalStore, type KeyboardEvent } from "react";
export type WorkspaceSection = { id: string; label: string; description?: string };
// Only a panel ID is remembered in memory; no entered form data or authority.
// An RSC refresh can omit a hash. Keep that refresh from resetting the task.
const selectedPanels = new Map<string, string>();
export function useWorkspaceSection(items: readonly WorkspaceSection[], fallback: string) {
  const remember = useCallback(() => {
    const id = window.location.hash.slice(1);
    if (items.some((item) => item.id === id)) {
      selectedPanels.set(window.location.pathname, id);
      if (selectedPanels.size > 100) selectedPanels.delete(selectedPanels.keys().next().value!);
    }
  }, [items]);
  const subscribe = useCallback(
    (callback: () => void) => {
      remember();
      const changed = () => {
        remember();
        callback();
      };
      window.addEventListener("hashchange", changed);
      window.addEventListener("popstate", changed);
      return () => {
        window.removeEventListener("hashchange", changed);
        window.removeEventListener("popstate", changed);
      };
    },
    [remember],
  );
  const current = useSyncExternalStore(
    subscribe,
    () => {
      const hash = window.location.hash.slice(1);
      return items.some((item) => item.id === hash)
        ? hash
        : (selectedPanels.get(window.location.pathname) ?? fallback);
    },
    () => fallback,
  );
  return {
    active: items.some((item) => item.id === current) ? current : fallback,
    select: (id: string) => {
      if (!items.some((item) => item.id === id)) return;
      selectedPanels.set(window.location.pathname, id);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}#${id}`,
      );
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
  };
}
export function WorkspaceSectionNav({
  items,
  active,
  select,
  label,
}: {
  items: readonly WorkspaceSection[];
  active: string;
  select: (id: string) => void;
  label: string;
}) {
  const group = useId();
  function key(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index + items.length - 1) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const item = items[next]!;
    select(item.id);
    document.getElementById(`${group}-${item.id}`)?.focus();
  }
  return (
    <div className="workspace-section-nav" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          id={`${group}-${item.id}`}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          aria-controls={item.id}
          tabIndex={active === item.id ? 0 : -1}
          onKeyDown={(event) => key(event, index)}
          onClick={() => select(item.id)}
        >
          <span>{item.label}</span>
          {item.description ? <small>{item.description}</small> : null}
        </button>
      ))}
    </div>
  );
}
