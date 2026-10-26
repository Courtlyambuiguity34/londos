"use client";
import { useSyncExternalStore } from "react";
import {
  decodeSavedShops,
  SAVED_SHOPS_KEY,
  SAVED_SHOPS_LIMIT,
  savedShopIds,
} from "./saved-contract";

const changed = "londos:saved-shops-changed";
const emptySnapshot = () => "[]";
function snapshot() {
  try {
    return window.localStorage.getItem(SAVED_SHOPS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === SAVED_SHOPS_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changed, notify);
  };
}
export function useSavedShops() {
  // A primitive snapshot is stable across renders; decode only after reading it.
  return decodeSavedShops(useSyncExternalStore(subscribe, snapshot, emptySnapshot));
}
export function setSavedShop(id: string, save: boolean) {
  savedShopIds.parse([id]);
  const ids = decodeSavedShops(window.localStorage.getItem(SAVED_SHOPS_KEY));
  const next = save ? [...new Set([...ids, id])] : ids.filter((value) => value !== id);
  if (next.length > SAVED_SHOPS_LIMIT)
    throw Error(
      `You can save up to ${SAVED_SHOPS_LIMIT} shops. Remove one from Saved shops first.`,
    );
  window.localStorage.setItem(SAVED_SHOPS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(changed));
}
export function clearSavedShops() {
  window.localStorage.removeItem(SAVED_SHOPS_KEY);
  window.dispatchEvent(new Event(changed));
}
