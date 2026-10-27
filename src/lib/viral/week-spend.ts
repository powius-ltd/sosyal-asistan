/**
 * Viral av haftalık tavanı: tavan her koşuda sıfırdan başlamaz; çalışma alanının O HAFTAKİ (İstanbul Pazartesi 00:00'dan beri) YALNIZ viral av
 * koşuları (`target_label` `viral:` ile başlar) düşülür: normal toplama / keşif harcaması av bütçesini azaltmaz. Tutar: kesinleşen `actual_usd`, yoksa `reserved_usd` (abonelik koşusu tutarsızdır, sayılmaz).
 */
import "server-only";

import { unwrap } from "@/lib/data/supabase/errors";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import type { AdminClient } from "@/lib/supabase/admin";
import { VIRAL_WEEKLY_CAP_USD } from "@/lib/viral/thresholds";

export interface SpendRow {
  reserved_usd: number | null;
  actual_usd: number | null;
}

export const sumSpendUsd = (rows: readonly SpendRow[]): number => Math.round(rows.reduce((sum, row) => sum + (row.actual_usd ?? row.reserved_usd ?? 0), 0) * 1e6) / 1e6;

/** Haftalık tavandan kalan tutar (negatif olmaz). */
export const remainingWeeklyUsd = (spentUsd: number): number => Math.max(0, Math.round((VIRAL_WEEKLY_CAP_USD - spentUsd) * 1e6) / 1e6);

/** Haftanın başı: İstanbul Pazartesi 00:00 (UTC+03, yaz saati yok) → mutlak an. */
export function istanbulWeekStartIso(now: Date): string {
  const today = toDayKey(now) ?? now.toISOString().slice(0, 10);
  const weekStart = weekStartOf(today) ?? today;
  return new Date(`${weekStart}T00:00:00+03:00`).toISOString();
}

export async function weekSpentUsd(client: AdminClient, workspaceId: string, now: Date): Promise<number> {
  const rows = unwrap(
    await client
      .from("collection_runs")
      .select("reserved_usd, actual_usd")
      .eq("workspace_id", workspaceId)
      .eq("billing", "metered")
      .like("target_label", "viral:%")
      .gte("started_at", istanbulWeekStartIso(now)),
  );
  return sumSpendUsd(rows);
}
