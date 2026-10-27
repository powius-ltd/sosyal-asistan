/**
 * Zaman sabitleri ve etiketleri — tek yer. Gün uzunluğu (`DAY_MS`), Türkçe kısa/tam gün adları ve saat etiketleri burada
 * durur; metrikler (`lib/metrics`), mock ve ekranlar (uyarı ayarları, haftalık özet, "en iyi paylaşım saatleri" kartı)
 * buradan alır, yerel kopya tanımlanmaz.
 */

/** Bir gün, milisaniye. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Python `weekday()` sırası: Pzt = 0 … Paz = 6 (metrikler ve takvim aynı sırayı kullanır). */
export const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

/** Tam gün adları; sıra `WEEKDAY_LABELS` ile aynıdır: Pzt = 0 … Paz = 6. */
export const WEEKDAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const satisfies {
  readonly length: typeof WEEKDAY_LABELS.length;
};

/** 0 = Pazartesi … 6 = Pazar; aralık dışı → undefined (sessizce başka gün gösterilmez). */
export function weekdayName(weekday: number): string | undefined {
  return Number.isInteger(weekday) ? WEEKDAY_NAMES[weekday] : undefined;
}

const pad = (hour: number) => String(hour).padStart(2, "0");

/** 9 → "09:00". */
export function hourLabel(hour: number): string {
  return `${pad(hour)}:00`;
}

/** 20 → "20:00–21:00"; 23 → "23:00–00:00" (gün sonu taşması 00:00 ile gösterilir). */
export function hourRangeLabel(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}
