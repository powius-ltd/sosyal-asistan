"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Kopya kabuğunda sol menünün tercihi: "closed" | "open". Yoksa / okunamazsa AÇIK. */
export const SIDE_NAV_STORAGE_KEY = "sp-side-nav";

const listeners = new Set<() => void>();

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(SIDE_NAV_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Menü açık mı + yazıcı. Depolama kapalıysa açık varsayılır ve tercih kalıcı olmaz. */
export function useSideNavPreference(): readonly [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  const write = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(SIDE_NAV_STORAGE_KEY, next ? "open" : "closed");
    } catch {
      // Depolama kapalı: tercih kalıcı olmaz.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [open, write] as const;
}
