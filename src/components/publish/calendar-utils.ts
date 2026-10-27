/**
 * Takvim matematiği. Tüm hesaplar "gün anahtarı" (`YYYY-MM-DD`) üzerinden yapılır: saat dilimi
 * dönüşümü yalnız işin zamanı gün anahtarına çevrilirken (`toDayKey`, workspace tz) olur; ızgara
 * hesabı saf takvim aritmetiğidir ve sistem saat diliminden etkilenmez. Hafta Pazartesi başlar.
 */
import { toDayKey } from "@/lib/format";
import { DAY_MS, WEEKDAY_LABELS } from "@/lib/time";

export type DayKey = string;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Kısa gün adları (Pzt…Paz): `lib/time.ts`'teki tek tablo. */
export const WEEKDAY_SHORT = WEEKDAY_LABELS;
export const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;
const MONTH_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

function toUtc(key: DayKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

function toKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

/** Geçerli bir takvim günü mü ("2026-02-30" değil). */
export function isDayKey(value: string | undefined): value is DayKey {
  if (!value || !DAY_KEY.test(value)) return false;
  const date = toUtc(value);
  return !Number.isNaN(date.getTime()) && toKey(date) === value;
}

export function addDays(key: DayKey, days: number): DayKey {
  return toKey(new Date(toUtc(key).getTime() + days * DAY_MS));
}

/** Ayın ilk günü. */
export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

/** `months` ay ileri/geri; sonuç her zaman ayın ilk günüdür (gün taşması olmasın). */
export function addMonths(key: DayKey, months: number): DayKey {
  const date = toUtc(startOfMonth(key));
  return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** Haftanın Pazartesi'si. */
export function startOfWeek(key: DayKey): DayKey {
  const offset = (toUtc(key).getUTCDay() + 6) % 7;
  return addDays(key, -offset);
}

export function weekDays(key: DayKey): DayKey[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Ayı kaplayan tam haftalar (her biri 7 gün; ay dışı günler dahil). */
export function monthWeeks(key: DayKey): DayKey[][] {
  const first = startOfMonth(key);
  const nextMonth = addMonths(first, 1);
  const weeks: DayKey[][] = [];
  for (let start = startOfWeek(first); start < nextMonth; start = addDays(start, 7)) {
    weeks.push(weekDays(start));
  }
  return weeks;
}

export function isSameMonth(a: DayKey, b: DayKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function dayOfMonth(key: DayKey): number {
  return Number(key.slice(8, 10));
}

/** "Eylül 2026". */
export function monthTitle(key: DayKey): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/**
 * "28 Eyl – 4 Eki 2026"; hafta aynı ay içindeyse "5 – 11 Eki 2026"; yıl değişirse iki yıl da yazılır.
 */
export function weekTitle(key: DayKey): string {
  const days = weekDays(key);
  const first = days[0];
  const last = days[6];
  const monthOf = (k: DayKey) => MONTH_SHORT[Number(k.slice(5, 7)) - 1];
  const part = (k: DayKey) => `${dayOfMonth(k)} ${monthOf(k)}`;
  if (first.slice(0, 4) !== last.slice(0, 4)) {
    return `${part(first)} ${first.slice(0, 4)} – ${part(last)} ${last.slice(0, 4)}`;
  }
  if (isSameMonth(first, last)) return `${dayOfMonth(first)} – ${part(last)} ${last.slice(0, 4)}`;
  return `${part(first)} – ${part(last)} ${last.slice(0, 4)}`;
}

/** Öğeleri ISO zamanlarının workspace saat dilimindeki gününe göre gruplar. Zamanı olmayan atlanır. */
export function bucketByDay<T>(
  items: T[],
  getIso: (item: T) => string | undefined,
  timeZone: string,
): Map<DayKey, T[]> {
  const buckets = new Map<DayKey, T[]>();
  for (const item of items) {
    const iso = getIso(item);
    const key = iso ? toDayKey(iso, timeZone) : undefined;
    if (!key) continue;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  return buckets;
}
