/**
 * Karar bloğunun dev saati: ISO zamandan "21:00 · Pazartesi · 12 Eki". Saat çalışma alanının saat dilimindedir (kişinin kendi saati);
 * hedef kitle başka dilimdeyse ve saat farklıysa küçük bir not eklenir ("hedef kitle için 14:00 ET"). Okunamayan zaman → undefined
 * (saat bloğu çizilmez; uydurma zaman yok). Saf.
 */
import { formatDayMonth, formatTime, timeZoneLabel, toDayKey } from "@/lib/format";
import { WEEKDAY_NAMES } from "@/lib/time";

export interface DueView {
  /** "21:00". */
  time: string;
  /** "Pazartesi". */
  weekday: string;
  /** "12 Eki". */
  date: string;
  /** Hedef kitle saati farklıysa: "hedef kitle için 14:00 ET". */
  audienceNote?: string;
}

export function dueView(dueAt: string | undefined, timeZone: string, audienceTimeZone?: string): DueView | undefined {
  if (dueAt === undefined) return undefined;
  const time = formatTime(dueAt, timeZone);
  const key = toDayKey(dueAt, timeZone);
  const date = formatDayMonth(dueAt, timeZone);
  if (time === undefined || key === undefined || date === undefined) return undefined;
  const weekday = WEEKDAY_NAMES[(new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7];
  const audienceTime = audienceTimeZone === undefined || audienceTimeZone === timeZone ? undefined : formatTime(dueAt, audienceTimeZone);
  const audienceNote =
    audienceTimeZone === undefined || audienceTime === undefined || audienceTime === time ? undefined : `hedef kitle için ${audienceTime} ${timeZoneLabel(audienceTimeZone)}`;
  return { time, weekday, date, audienceNote };
}
