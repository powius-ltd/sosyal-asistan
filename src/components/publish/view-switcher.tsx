import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { monthTitle, weekTitle, type DayKey } from "@/components/publish/calendar-utils";
import { PUBLISH_VIEWS, VIEW_LABEL, publishHref, shiftAnchor, type PublishView } from "@/components/publish/view-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIEW_ICON: Record<PublishView, LucideIcon> = {
  liste: List,
  hafta: CalendarRange,
  ay: CalendarDays,
};

interface ViewSwitcherProps {
  view: PublishView;
  anchor: DayKey;
  today: DayKey;
}

/** Görünüm seçici (Liste | Hafta | Ay) + takvim görünümlerinde önceki/bugün/sonraki gezinmesi. */
export function ViewSwitcher({ view, anchor, today }: ViewSwitcherProps) {
  const isCalendar = view !== "liste";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Görünüm" className="inline-flex items-center rounded-lg bg-muted p-[3px]">
        {PUBLISH_VIEWS.map((v) => {
          const Icon = VIEW_ICON[v];
          const active = v === view;
          return (
            <Link
              key={v}
              href={publishHref(v, anchor)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 min-h-tap items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors md:min-h-0 md:px-2.5",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {VIEW_LABEL[v]}
            </Link>
          );
        })}
      </nav>

      {isCalendar ? (
        <div className="flex items-center gap-2">
          <span className="min-w-36 text-right text-sm font-medium">
            {view === "ay" ? monthTitle(anchor) : weekTitle(anchor)}
          </span>
          <div className="flex items-center gap-1">
            <Link
              href={publishHref(view, shiftAnchor(view, anchor, -1))}
              aria-label={view === "ay" ? "Önceki ay" : "Önceki hafta"}
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "min-h-tap min-w-tap md:min-h-0 md:min-w-0")}
            >
              <ChevronLeft aria-hidden />
            </Link>
            <Link href={publishHref(view, today)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-tap md:min-h-0")}>
              Bugün
            </Link>
            <Link
              href={publishHref(view, shiftAnchor(view, anchor, 1))}
              aria-label={view === "ay" ? "Sonraki ay" : "Sonraki hafta"}
              className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "min-h-tap min-w-tap md:min-h-0 md:min-w-0")}
            >
              <ChevronRight aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
