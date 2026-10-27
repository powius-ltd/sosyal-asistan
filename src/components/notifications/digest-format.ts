/** Haftalık özet gösterim yardımcıları (saf; biçimler `lib/format.ts`'ten). */
import { formatDate, formatNumber } from "@/lib/format";

/** Değişim: +1.234 / −56 / 0. Eksi işareti gerçek eksi (−) olarak yazılır; ölçülemeyen girdi → undefined (0 uydurulmaz). */
export function formatSigned(n: number | undefined | null): string | undefined {
  const text = formatNumber(n === undefined || n === null ? undefined : Math.abs(n));
  if (text === undefined || n === undefined || n === null) return undefined;
  if (n > 0) return `+${text}`;
  return n < 0 ? `−${text}` : text;
}

/** "23 Eyl 2026 – 30 Eyl 2026" (workspace saat diliminde); geçersiz tarihte undefined. */
export function formatDigestPeriod(periodStart: string, periodEnd: string, timeZone: string): string | undefined {
  const from = formatDate(periodStart, timeZone);
  const to = formatDate(periodEnd, timeZone);
  return from && to ? `${from} – ${to}` : undefined;
}
