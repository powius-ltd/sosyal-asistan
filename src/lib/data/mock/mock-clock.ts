/**
 * Mock verinin saati. Veri sabit bir "şimdi"ye göre üretilir (aynı tohum → aynı veri);
 * mutasyonların zaman damgası da bu saatten ilerler (her çağrıda +1 sn), böylece
 * ay/tavan hesapları gerçek saatten bağımsız ve tutarlı kalır.
 */

import { DAY_MS } from "@/lib/time";

/** Varsayılan sabit "şimdi" (Europe/Istanbul'da 30 Eyl 2026 12:00). */
export const MOCK_NOW = "2026-09-30T09:00:00.000Z";

export interface MockClock {
  readonly nowMs: number;
  readonly nowIso: string;
  /** Şimdiden `days` gün (ondalık olabilir) önce. */
  daysAgo(days: number): string;
  /** Şimdiden `days` gün sonra. */
  daysAhead(days: number): string;
  /** ISO zamanın şimdiye göre yaşı (gün). */
  ageDays(iso: string): number;
  /** Mutasyon zaman damgası: şimdi + her çağrıda 1 sn ileri (sıralama korunur). */
  tick(): string;
}

export function createClock(now: string = MOCK_NOW): MockClock {
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(nowMs)) throw new Error(`mock-clock: geçersiz zaman: ${now}`);
  let ticks = 0;
  return {
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    daysAgo: (days) => new Date(nowMs - days * DAY_MS).toISOString(),
    daysAhead: (days) => new Date(nowMs + days * DAY_MS).toISOString(),
    ageDays: (iso) => (nowMs - new Date(iso).getTime()) / DAY_MS,
    tick: () => new Date(nowMs + ++ticks * 1000).toISOString(),
  };
}
