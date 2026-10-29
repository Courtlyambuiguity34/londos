"use client";
import { useSyncExternalStore } from "react";
import { COMPARISON_KEY, COMPARISON_LIMIT, comparisonIds, decodeComparison } from "./comparison";

const changed = "londos:comparison-changed";
function snapshot() {
  try {
    return window.localStorage.getItem(COMPARISON_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === COMPARISON_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changed, notify);
  };
}
export function useComparison() {
  return decodeComparison(useSyncExternalStore(subscribe, snapshot, () => "[]"));
}
export function setComparisonProduct(id: string, selected: boolean) {
  comparisonIds.parse([id]);
  const ids = decodeComparison(window.localStorage.getItem(COMPARISON_KEY));
  const next = selected ? [...new Set([...ids, id])] : ids.filter((value) => value !== id);
  if (next.length > COMPARISON_LIMIT)
    throw Error(`Compare up to ${COMPARISON_LIMIT} products. Remove a selection first.`);
  window.localStorage.setItem(COMPARISON_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(changed));
}
export function clearComparison() {
  window.localStorage.removeItem(COMPARISON_KEY);
  window.dispatchEvent(new Event(changed));
}
