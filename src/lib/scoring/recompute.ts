/**
 * Bir hesabın (kendi hesap / rakip) skor önbelleğini DB'den yeniden hesaplar:
 * içerikler + son metrikler (`content_latest_metrics`) + en son bilinen takipçi (`account_snapshots`) okunur →
 * `scoreAccount` (lib/metrics) → skor sütunları + `baseline_excluded` + `baseline_basis` + `scored_at` toplu yazılır.
 *
 * İdempotent: aynı veri ve aynı `now` ile her çalıştırma aynı satırları yazar (çıktı okuma sırasından bağımsız).
 * Ölçülemeyen NULL'dır: takipçi yoksa `cross_score` NULL, views yoksa `lift`/`lift_tier` NULL (0 değil).
 */
import "server-only";

import { isValidDate } from "@/lib/metrics/dates";
import { scoreOwnerContent } from "@/lib/scoring/score-owner";
import { defaultScoringStore } from "@/lib/scoring/supabase-store";
import type { ScoringOwner, ScoringStore } from "@/lib/scoring/types";

export interface ScoringDeps {
  /** DB erişimi; verilmezse service role Supabase deposu. */
  store?: ScoringStore;
}

export interface AccountScoresResult {
  owner: ScoringOwner;
  /** Skoru yazılan içerik sayısı. */
  items: number;
  /** Kullanılan takipçi sayısı; undefined = bilinmiyor (cross_score NULL yazıldı). */
  followers?: number;
}

export function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || !isValidDate(now)) {
    throw new RangeError("Skor: geçersiz referans zamanı (now).");
  }
}

export async function recomputeAccountScores(
  wsId: string,
  owner: ScoringOwner,
  now: Date,
  deps: ScoringDeps = {},
): Promise<AccountScoresResult> {
  assertValidNow(now);
  const store = deps.store ?? defaultScoringStore();

  const rows = await store.listOwnerContent(wsId, owner);
  if (rows.length === 0) return { owner, items: 0 };

  const ids = rows.map((row) => row.id);
  const [metrics, followers] = await Promise.all([
    store.latestMetrics(wsId, ids),
    store.latestFollowers(wsId, owner),
  ]);

  const writes = scoreOwnerContent({ rows, metrics, followers, now });
  await store.writeScores(writes);
  return { owner, items: writes.length, followers };
}
