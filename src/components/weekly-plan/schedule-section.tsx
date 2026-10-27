import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { PlanNote, PlanSection } from "@/components/weekly-plan/plan-section";
import {
  SLOT_BASIS_LABEL,
  weekDayKeys,
  type ScheduleSection,
  type ScheduleSlot,
  type WeeklyPlanItem,
} from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, formatDayMonth, formatDecimal, formatWeekdayTime, timeZoneLabel } from "@/lib/format";
import { plainOrFallback } from "@/lib/plain-language-plan";
import { WEEKDAY_NAMES, hourLabel } from "@/lib/time";

function SlotEntry({ slot, title, audienceTimeZone }: { slot: ScheduleSlot; title?: string; audienceTimeZone: string }) {
  const istanbul = formatWeekdayTime(slot.at, DEFAULT_TIMEZONE);
  const sameZone = audienceTimeZone === DEFAULT_TIMEZONE;
  return (
    <li className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular">
          {slot.position}
        </span>
        <span className="font-medium tabular">
          {hourLabel(slot.hour)} {timeZoneLabel(audienceTimeZone)}
        </span>
      </div>
      {sameZone || !istanbul ? null : (
        <span className="text-muted-foreground tabular">
          {istanbul} {timeZoneLabel(DEFAULT_TIMEZONE)}
        </span>
      )}
      {title ? <span className="line-clamp-2 leading-snug">{title}</span> : null}
      <Hint content={plainOrFallback(slot.note, SLOT_BASIS_LABEL[slot.basis])} label={SLOT_BASIS_LABEL[slot.basis]} className="w-fit">
        <span className="text-muted-foreground underline decoration-dotted underline-offset-2">{SLOT_BASIS_LABEL[slot.basis]}</span>
      </Hint>
    </li>
  );
}

/** Bölüm 4 — Takvim: haftanın 7 günü; slot saatleri hedef kitle diliminde (ET), yanında İstanbul karşılığı. */
export function ScheduleSectionView({
  schedule,
  weekStart,
  items,
}: {
  schedule: ScheduleSection;
  weekStart: string;
  items: WeeklyPlanItem[];
}) {
  const dayKeys = weekDayKeys(weekStart);
  const slotsByDay = new Map<number, ScheduleSlot[]>();
  for (const slot of schedule.slots) slotsByDay.set(slot.weekday, [...(slotsByDay.get(slot.weekday) ?? []), slot]);
  const titleOf = (slot: ScheduleSlot) =>
    items.find((item) => (slot.ideaId ? item.ideaId === slot.ideaId : item.position === slot.position))?.idea.title;

  return (
    <PlanSection
      id="schedule"
      title="Takvim"
      description={
        <>
          Haftada {schedule.postsPerWeek} paylaşım.{" "}
          {schedule.audienceTimeZone === DEFAULT_TIMEZONE
            ? "Saatler İstanbul saatiyle."
            : `Saatler hedef kitle diliminde (${timeZoneLabel(schedule.audienceTimeZone)}), İstanbul karşılığı altında.`}{" "}
          Rakiplerin tipik haftalık paylaşımı:{" "}
          <MeasuredValue
            value={schedule.rivalMedianPostsPerWeek}
            format={(v) => formatDecimal(v, 1)}
            reason="Rakiplerin haftalık paylaşım sıklığı ölçülemedi."
          />
        </>
      }
    >
      {dayKeys.length === 0 ? (
        <PlanNote>Hafta başlangıcı okunamadı; takvim çizilemedi.</PlanNote>
      ) : (
        <>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Haftalık takvim">
            {dayKeys.map((dayKey, weekday) => {
              const slots = slotsByDay.get(weekday) ?? [];
              return (
                <li key={dayKey} className="flex min-w-0 flex-col gap-2 rounded-xl border p-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-1">
                    <span className="text-sm font-medium">{WEEKDAY_NAMES[weekday]}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatDayMonth(dayKey, "UTC")}</span>
                  </div>
                  {slots.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Paylaşım yok</span>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {slots.map((slot) => (
                        <SlotEntry key={slot.position} slot={slot} title={titleOf(slot)} audienceTimeZone={schedule.audienceTimeZone} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {schedule.slots.length === 0 ? <PlanNote>{plainOrFallback(schedule.unmeasuredReason, "Bu plan için paylaşım saati atanmadı.")}</PlanNote> : null}
        </>
      )}
    </PlanSection>
  );
}
