"use client";

import { useSyncExternalStore } from "react";

/** Tailwind `md` kırılımı (768 px): masaüstünde sohbet penceresi Popover, altında tam ekran Sheet. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Ekran `md` ve üstü mü. Sunucuda/ilk hidrasyonda `false` (mobil düzen): sohbet kapalıyken iki düzen aynı görünür (yalnız düğme),
 * panel açılırken doğru değer okunur; hidrasyon uyuşmazlığı çıkmaz.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Tailwind `lg` kırılımı (1024 px): geniş ekranda sohbet sağda sabit sütundur (popover değil). */
const WIDE_QUERY = "(min-width: 1024px)";

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Ekran `lg` ve üstü mü (sağ sabit sütun). Sunucuda/ilk hidrasyonda `false`: sütun hidrasyondan sonra gelir. */
export function useIsWideDesktop(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}
