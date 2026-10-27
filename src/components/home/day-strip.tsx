import Link from "next/link";
import type { CSSProperties } from "react";

import { TODAY_COPY } from "@/lib/copy/today";
import type { DayStrip as DayStripModel, DayStripItem } from "@/lib/home/day-strip";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Durum rozetinin rengi: sıradaki sarı (ekranın "sıra sende"si), yayınlanan/sonuçlanan yeşil, kalan nötr. */
const CHIP_TONE: Partial<Record<DayStripItem["status"], string>> = {
  next: "bg-attention text-attention-ink",
  published: "bg-success-soft text-success-soft-foreground",
  awaiting_result: "bg-success-soft text-success-soft-foreground",
  result: "bg-success-soft text-success-soft-foreground",
};

const EMPTY_HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--unmeasured-hatch)_7px_8px)]";

/**
 * Hafta şeridi: 7 gün. Telefonda yana kayar (dolu gün geniş kart, boş gün dar taralı kutu); geniş ekranda tek satır, dolu günler geniş.
 * Dolu gün planın maddesine (fikir ekranı) bağlanır. Boş gün plan yok demek değil, o gün içerik planlanmadı demektir.
 */
export function DayStrip({ strip }: { strip: DayStripModel }) {
  const columns = strip.days.map((day) => (day.items.length > 0 ? "1.7fr" : "0.5fr")).join(" ");
  return (
    <div
      role="group"
      aria-label={TODAY_COPY.weekAria}
      tabIndex={0}
      style={{ "--day-columns": columns } as CSSProperties}
      className="-mx-4 flex snap-x snap-proximity scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-0.5 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-[var(--day-columns)] lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {strip.days.map((day) =>
        day.items.length === 0 ? (
          <div
            key={day.key}
            data-day={day.key}
            data-empty="true"
            role="group"
            aria-label={`${day.weekday} ${day.dayNumber}, ${TODAY_COPY.weekEmptyDay}`}
            className={cn("flex w-16 shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-card px-1.5 py-3 text-sm text-muted-foreground ring-1 ring-border lg:w-auto", EMPTY_HATCH)}
          >
            <span>{day.weekday}</span>
            <span className="font-figure text-lg">{day.dayNumber}</span>
          </div>
        ) : (
          <div key={day.key} data-day={day.key} data-next={day.isNext} className="flex w-[12.75rem] shrink-0 snap-start flex-col gap-2 lg:w-auto lg:min-w-0">
            {day.items.map((item) => (
              <Link
                key={item.ideaId}
                href={`${ROUTES.ideas}?id=${encodeURIComponent(item.ideaId)}`}
                data-status={item.status}
                className={cn(
                  "flex min-h-[9.25rem] min-w-0 flex-1 flex-col gap-1.5 rounded-card px-3.5 pt-3 pb-3.5 transition-transform duration-fast active:scale-[0.98]",
                  item.status === "next" ? "bg-brand-soft ring-[1.5px] ring-awaiting-border" : "bg-card",
                )}
              >
                <span className={cn("flex items-baseline gap-1.5 text-sm font-semibold", item.status === "next" ? "text-brand" : "text-muted-foreground")}>
                  {day.weekday}
                  <i className={cn("font-figure text-lg not-italic", item.status === "next" ? "text-brand" : "text-foreground")}>{day.dayNumber}</i>
                  <time className="ml-auto tabular-nums">{item.time}</time>
                </span>
                <span className="line-clamp-3 leading-snug font-semibold break-words">{item.title}</span>
                <span className={cn("mt-auto w-fit rounded-pill px-2.5 py-0.5 text-[0.8125rem] font-semibold", CHIP_TONE[item.status] ?? "bg-background text-muted-foreground")}>
                  {item.statusLabel}
                </span>
              </Link>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
