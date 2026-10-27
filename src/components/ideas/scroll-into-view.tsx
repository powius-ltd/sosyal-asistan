"use client";

import { useEffect, useRef } from "react";

/**
 * `?id=` ile gelinen fikir kartını açılışta görünür yere kaydırır (D2-02): kart 4. sırada olsa da ekran en tepede kalmaz. Kartın
 * İÇİNE konur (kendi kartını bulur), yalnız ilk çizimde bir kez çalışır; hareket azaltma tercihinde animasyon yok.
 */
export function ScrollIntoView() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const card = marker.current?.closest("[data-slot='card']");
    if (!(card instanceof HTMLElement)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    card.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, []);

  return <span ref={marker} hidden aria-hidden />;
}
