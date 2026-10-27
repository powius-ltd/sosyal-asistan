/** Gün anahtarı ("YYYY-AA-GG") aritmetiği; UTC üzerinden, saat dilimi kayması yok. */
import { DAY_MS } from "@/lib/time";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function shiftDay(day: string, delta: number): string {
  if (!DAY_KEY.test(day)) throw new Error(`Gün biçimi geçersiz: ${day}`);
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** `from`dan `to`ya gün farkı (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
