"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Geniş ekranda sohbet sütununun tercihi: "closed" | "open". Yoksa / okunamazsa AÇIK. */
export const DOCK_STORAGE_KEY = "sp-chat-dock";

const listeners = new Set<() => void>();

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(DOCK_STORAGE_KEY) !== "closed";
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

/** Sütun açık mı + yazıcı. Tercih `localStorage`'dadır; depolama kapalıysa açık varsayılır ve tercih kalıcı olmaz. */
export function useDockPreference(): readonly [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  const write = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(DOCK_STORAGE_KEY, next ? "open" : "closed");
    } catch {
      // Depolama kapalı: tercih kalıcı olmaz.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [open, write] as const;
}
