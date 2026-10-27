"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { SCROLL_HINT_PLAIN } from "@/lib/plain-language-results";
import { cn } from "@/lib/utils";

/**
 * Yatay kayan içerik (geniş tablo, harita) için çerçeve: içerik taşıyorsa kenarlarda kaydırma gölgesi ve dar ekranda görünür
 * "Yana kaydırarak devamını gör" ipucu çizer; taşmıyorsa hiçbiri çizilmez. Kaydırılabilen alan klavyeyle de odaklanıp kaydırılır
 * (`tabIndex=0`, `region` + ad). İlk sütunu yapışkan yapmak çağıranın işidir (`sticky left-0 bg-background`).
 */
export function ScrollHint({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: max > 2 && el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Eski tarayıcı / sınama ortamında gözlemci yoksa yalnız bir kez ölçülür (kaydırınca `onScroll` yeniden ölçer).
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  const overflowing = edges.left || edges.right;
  return (
    <div className={cn("relative", className)}>
      <div ref={ref} role="region" aria-label={label} tabIndex={0} onScroll={measure} className="overflow-x-auto rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {children}
      </div>
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 z-20 w-6 bg-gradient-to-r from-foreground/10 to-transparent transition-opacity", edges.left ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-20 w-6 bg-gradient-to-l from-foreground/10 to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")} />
      {overflowing ? <p className="mt-1.5 text-xs text-muted-foreground md:hidden">{SCROLL_HINT_PLAIN} →</p> : null}
    </div>
  );
}

/**
 * `ScrollHint` içinde kendi kaydırma alanı olmayan tablo (`ui/table`'ın `Table`'ı kendi kaydırma kabını da çizer; iç içe iki kaydırıcı
 * ipucunu şaşırtır). Hücre bileşenleri (`TableRow`, `TableHead`, …) olduğu gibi kullanılır.
 */
export function ScrollTable({ label, className, wrapperClassName, ...props }: ComponentProps<"table"> & { label: string; wrapperClassName?: string }) {
  return (
    <ScrollHint label={label} className={wrapperClassName}>
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </ScrollHint>
  );
}
