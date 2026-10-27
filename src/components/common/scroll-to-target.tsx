"use client";

import { useEffect } from "react";

/**
 * Sayfa bir hedefe işaret ederek açıldığında (adresteki hücre / video seçimi) hedef paneli görünür yapar ve odağı ona verir.
 * Hedef, `id`'li ve `tabIndex={-1}` verilmiş bir öğedir; bileşen o öğenin İÇİNDE (ya da yanında) çizilir ve yalnız bağlandığında
 * çalışır: hedefi değişen sayfa bileşeni `key` ile yeniden bağlar. Next'in kendi kaydırması bittikten sonra çalışsın diye iki
 * çerçeve beklenir. Hareketi azalt tercihinde kaydırma yumuşatılmaz.
 */
export function ScrollToTarget({ targetId }: { targetId: string }) {
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const el = document.getElementById(targetId);
        if (!el) return;
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
        el.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [targetId]);
  return null;
}
