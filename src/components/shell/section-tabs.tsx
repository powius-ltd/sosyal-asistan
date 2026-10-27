"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { locate, primaryById, visibleSections } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/** Kenar solması: kaydırılabilir yönde şerit silikleşir (yarım kalan etiket kesik değil, kaydırılabilir görünür). */
const EDGE_MASK = {
  none: "",
  start: "[mask-image:linear-gradient(to_right,transparent,black_2rem)]",
  end: "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]",
  both: "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]",
} as const;

/**
 * İkinci düzey sekme şeridi (Plan: Bu hafta · Fikirler; Videolar: İçeriklerim · Yayın; Sonuçlar: Özet · Tutanlar · Rakipler · …).
 * Panel düzeninde, içerik alanının başında TEK yerde çizilir (sayfalar çizmez): sekmeler bulunulan yolun ana maddesinden türer
 * (`nav-items.ts`). Tek sayfalı maddede (Bugün) ve profil menüsü sayfalarında çizilmez. Dar ekranda şerit kendi içinde yatay kayar
 * (sayfa taşmaz) ve etkin sekme görünür yere getirilir. `/video/[id]` gibi maddesiz yolda sekmeler görünür, hiçbiri etkin değildir.
 */
export function SectionTabs({ operatorMode = false, copyEdition = false }: { operatorMode?: boolean; copyEdition?: boolean }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const location = locate(pathname);
  const primary = location !== undefined && location.area !== "menu" ? primaryById(location.area) : undefined;
  const activeHref = location?.leaf?.href;
  const [edges, setEdges] = useState<keyof typeof EDGE_MASK>("end");

  const updateEdges = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const canStart = list.scrollLeft > 1;
    const canEnd = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setEdges(canStart && canEnd ? "both" : canStart ? "start" : canEnd ? "end" : "none");
  }, []);

  // Etkin sekme şeridin görünen kısmında değilse ortaya kaydır (yalnız şeridin kendi yatay kaydırması; sayfa kıpırdamaz).
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active) return;
    list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    updateEdges();
  }, [activeHref, updateEdges]);

  const sections = primary === undefined ? [] : visibleSections(primary, operatorMode, copyEdition);
  if (primary === undefined || sections.length < 2) return null;

  return (
    <nav aria-label={`${primary.label} bölümleri`} data-testid="section-tabs" className="-mx-4 mb-5 md:mx-0 md:mb-6">
      <ul
        ref={listRef}
        onScroll={updateEdges}
        className={cn("relative flex items-center gap-1 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:px-0 md:[mask-image:none] [&::-webkit-scrollbar]:hidden", EDGE_MASK[edges])}
      >
        {sections.map((leaf) => {
          const active = leaf.href === activeHref;
          return (
            <Fragment key={leaf.href}>
              {leaf.groupLabel ? (
                <li role="presentation" aria-hidden className="flex shrink-0 items-center gap-3 px-2 text-xs text-muted-foreground">
                  <span className="h-5 w-px bg-border" />
                  <span className="hidden whitespace-nowrap lg:inline">{leaf.groupLabel}</span>
                </li>
              ) : null}
              <li className="shrink-0">
                <Link
                  href={leaf.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-tap items-center rounded-pill px-4 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none md:min-h-10",
                    active
                      ? "bg-brand-soft font-semibold text-brand-soft-foreground"
                      : "font-medium text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                >
                  {leaf.label}
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
