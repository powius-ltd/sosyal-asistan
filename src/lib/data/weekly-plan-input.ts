/**
 * Haftalık plan girdi doğrulaması: `getWeeklyPlan` hafta günü. Mock ve Supabase AYNI kuralı kullanır (tek yer).
 * "YYYY-MM-DD" takvim günü beklenir (`weekStartOf`); Pazartesi değilse o günün haftasına hizalanır, biçimsiz/var olmayan
 * gün (`2026-02-31`, "bugün") → `invalid_input`.
 */
import { RepositoryError } from "@/lib/data/repository";
import { weekStartOf } from "@/lib/domain/weekly-plan";

export function parseWeekStart(input: unknown): string {
  const start = typeof input === "string" ? weekStartOf(input.trim()) : undefined;
  if (start === undefined) throw new RepositoryError("invalid_input", `Hafta günü "YYYY-MM-DD" biçiminde geçerli bir tarih olmalı: ${String(input)}`);
  return start;
}
