/**
 * Hafta şeridi: planın haftasının 7 günü (Pazartesi → Pazar), her günde o güne düşen plan maddeleri; maddesi olmayan gün boş (taralı).
 * Saf: saat dilimi ve durumlar girdiden gelir. Günü belirlenemeyen madde (saati atanmamış ya da haftanın dışında) şeride girmez, sayılır
 * (`unplaced`): sessizce başka güne konmaz.
 */
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { formatTime, toDayKey } from "@/lib/format";
import { PLAN_ITEM_STATUS_LABEL, type PlanItemStatus } from "@/lib/overview/plan-item-status";
import { DAY_MS, WEEKDAY_LABELS } from "@/lib/time";

export interface DayStripItem {
  ideaId: string;
  title: string;
  /** "21:00" (çalışma alanı saat diliminde). */
  time: string;
  status: PlanItemStatus["kind"];
  statusLabel: string;
}

export interface DayStripDay {
  /** YYYY-AA-GG. */
  key: string;
  /** "Pzt". */
  weekday: string;
  /** Ayın günü: 12. */
  dayNumber: number;
  items: DayStripItem[];
  /** Haftanın sıradaki çekimini taşıyan gün. */
  isNext: boolean;
}

export interface DayStrip {
  days: DayStripDay[];
  /** Şeride yerleştirilemeyen madde sayısı. */
  unplaced: number;
}

/** Gün anahtarına gün ekler (UTC takvim aritmetiği; saat dilimi kaymaz). */
function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function buildDayStrip(plan: WeeklyPlan, statuses: readonly PlanItemStatus[], timeZone: string): DayStrip {
  const days: DayStripDay[] = WEEKDAY_LABELS.map((weekday, index) => {
    const key = addDays(plan.weekStart, index);
    return { key, weekday, dayNumber: Number(key.slice(8, 10)), items: [], isNext: false };
  });
  let unplaced = 0;
  plan.items.forEach((item, index) => {
    const status: PlanItemStatus = statuses[index] ?? { kind: "to_shoot" };
    const key = item.slotAt === undefined ? undefined : toDayKey(item.slotAt, timeZone);
    const day = days.find((candidate) => candidate.key === key);
    const time = formatTime(item.slotAt, timeZone);
    if (day === undefined || time === undefined) {
      unplaced += 1;
      return;
    }
    day.items.push({ ideaId: item.ideaId, title: item.idea.title, time, status: status.kind, statusLabel: PLAN_ITEM_STATUS_LABEL[status.kind] });
    if (status.kind === "next") day.isNext = true;
  });
  for (const day of days) day.items.sort((a, b) => a.time.localeCompare(b.time));
  return { days, unplaced };
}
