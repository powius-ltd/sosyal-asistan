import Link from "next/link";

import {
  WEEKDAY_SHORT,
  bucketByDay,
  dayOfMonth,
  isSameMonth,
  monthWeeks,
  weekDays,
  type DayKey,
} from "@/components/publish/calendar-utils";
import { type PublishJobView } from "@/components/publish/job-views";
import { PUBLISH_STATUS_LABEL, PUBLISH_STATUS_STYLE } from "@/components/publish/publish-status";
import { publishHref } from "@/components/publish/view-state";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { truncateText } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Ay hücresinde en fazla bu kadar çip gösterilir; fazlası "+N daha" olur (haftaya bağlanır). */
const MONTH_CHIPS_PER_DAY = 3;
const WEEK_CAPTION_CHARS = 60;

/** "14:05": `formatDateTime` çıktısının saat kısmı (gün/ay biçimi tek yerde kalsın). */
function timeOfDay(iso: string | undefined, timeZone: string): string {
  return formatDateTime(iso, timeZone)?.slice(-5) ?? "";
}

function JobChip({ view, mode, timeZone }: { view: PublishJobView; mode: "hafta" | "ay"; timeZone: string }) {
  const { job, accountLabel } = view;
  const time = timeOfDay(job.scheduledFor, timeZone);
  const status = PUBLISH_STATUS_LABEL[job.status];
  const title = [time, status, accountLabel, job.caption ? truncateText(job.caption, 120) : undefined]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`${publishHref("liste")}#is-${job.id}`}
      title={title}
      className={cn(
        "flex min-w-0 flex-col rounded-md px-1.5 py-1 text-xs leading-tight transition-opacity hover:opacity-80",
        PUBLISH_STATUS_STYLE[job.status],
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="font-medium tabular">{time}</span>
        <span className="truncate">{mode === "ay" ? accountLabel : status}</span>
      </span>
      {mode === "hafta" ? (
        <span className="mt-0.5 line-clamp-2 break-words opacity-90">
          {accountLabel}
          {job.caption ? ` · ${truncateText(job.caption, WEEK_CAPTION_CHARS)}` : ""}
        </span>
      ) : null}
    </Link>
  );
}

interface DayCellProps {
  day: DayKey;
  today: DayKey;
  anchor: DayKey;
  mode: "hafta" | "ay";
  views: PublishJobView[];
  timeZone: string;
}

function DayCell({ day, today, anchor, mode, views, timeZone }: DayCellProps) {
  const outside = mode === "ay" && !isSameMonth(day, anchor);
  const isToday = day === today;
  const visible = mode === "ay" ? views.slice(0, MONTH_CHIPS_PER_DAY) : views;
  const hidden = views.length - visible.length;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 p-1.5 not-last:border-r",
        mode === "ay" ? "min-h-28" : "min-h-56",
        outside && "bg-muted/30",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full text-xs",
          isToday ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
        aria-label={isToday ? `${dayOfMonth(day)} (bugün)` : undefined}
      >
        {dayOfMonth(day)}
      </span>
      {visible.map((view) => (
        <JobChip key={view.job.id} view={view} mode={mode} timeZone={timeZone} />
      ))}
      {hidden > 0 ? (
        <Link href={publishHref("hafta", day)} className="px-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
          +{hidden} daha
        </Link>
      ) : null}
    </div>
  );
}

interface PublishCalendarProps {
  mode: "hafta" | "ay";
  anchor: DayKey;
  today: DayKey;
  views: PublishJobView[];
  timeZone: string;
}

/** Hafta/ay takvimi: planlanan zamanı olan işler workspace saat dilimindeki gününe yerleşir. */
export function PublishCalendar({ mode, anchor, today, views, timeZone }: PublishCalendarProps) {
  const byDay = bucketByDay(views, (v) => v.job.scheduledFor, timeZone);
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.job.scheduledFor ?? "").localeCompare(b.job.scheduledFor ?? ""));
  }
  const weeks = mode === "ay" ? monthWeeks(anchor) : [weekDays(anchor)];
  const unscheduled = views.filter((v) => !v.job.scheduledFor).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[46rem] overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            {WEEKDAY_SHORT.map((name) => (
              <div key={name} className="px-2 py-1.5">
                {name}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 not-last:border-b">
              {week.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  today={today}
                  anchor={anchor}
                  mode={mode}
                  views={byDay.get(day) ?? []}
                  timeZone={timeZone}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {unscheduled > 0 ? (
        <p className="text-xs text-muted-foreground">
          {unscheduled} işin planlanan zamanı yok; takvimde görünmez.{" "}
          <Link href={ROUTES.publish} className="underline hover:text-foreground">
            Liste görünümünde gör
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
