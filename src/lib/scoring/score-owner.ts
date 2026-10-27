/**
 * Bir sahibin (kendi hesap / rakip) içeriklerini skorlar ve yazılacak satırları üretir. Saf; DB erişimi yok.
 *
 * Hesap `lib/metrics`'tedir (PLAN.md "Metodoloji"): skor `scoreAccount`, açıklama (`baseline_basis` +
 * `baseline_excluded`) `accountBaseline` — ikisi de AYNI girdi ve AYNI `now` ile, sahibin TÜM içerikleri
 * üzerinde. (Mock'taki `applyScores` ile aynı yöntem; açıklamanın sayaçları diğer format/viewsKind'ları da sayar.)
 * Çıktı girdi sırasından bağımsızdır (baz çizgisi tarih + kimliğe göre sıralanır) → aynı girdi, aynı satırlar.
 */
import { accountBaseline, scoreAccount, type ScorableItem } from "@/lib/metrics";
import { toScorableItem } from "@/lib/scoring/to-scorable";
import { pickIdentity, toScoreColumns } from "@/lib/scoring/to-score-row";
import type { ContentScoringRow, LatestMetricsRow, ScoreWriteRow } from "@/lib/scoring/types";

export interface OwnerScoringInput {
  /** Sahibin tüm içerikleri (baz çizgisi yalnız bu hesabın içeriklerinden gelir). */
  rows: readonly ContentScoringRow[];
  /** İçerik kimliği → en son ölçüm. Olmayan içerik "hiç ölçülmedi" sayılır. */
  metrics: ReadonlyMap<string, LatestMetricsRow>;
  /** Hesabın takipçi sayısı; bilinmiyorsa undefined → cross_score NULL. */
  followers: number | undefined;
  /** Referans an: yaş/olgunluk hesabı ve `scored_at`. */
  now: Date;
}

/**
 * Yalnız performans: baz çizgisi her hedef için uygun içerikleri yeniden eskiye (eşitlikte id) sıralar; girdi zaten
 * bu sıradaysa sıralama doğrusal kalır (TimSort) ve N içerik O(N² log N) yerine ~O(N²) sürer. Sonuç sıradan bağımsızdır.
 */
function newestFirst(a: ScorableItem, b: ScorableItem): number {
  // Tarihsiz içerik sona (baz çizgisine zaten girmez); iki tarihsiz → NaN → kimliğe göre.
  const time = (it: ScorableItem) => it.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const byDate = time(b) - time(a);
  if (byDate !== 0 && !Number.isNaN(byDate)) return byDate;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function scoreOwnerContent({ rows, metrics, followers, now }: OwnerScoringInput): ScoreWriteRow[] {
  const scorable = rows.map((row) => toScorableItem(row, metrics.get(row.id)));
  const ordered = [...scorable].sort(newestFirst);
  const scores = scoreAccount(ordered, followers, now);

  return rows.map((row, index) => {
    const score = scores.get(row.id);
    if (!score) throw new Error(`Skor: içerik skorlanamadı (${row.id}).`);
    const baseline = accountBaseline(ordered, scorable[index], { now });
    return { ...pickIdentity(row), ...toScoreColumns(score, baseline, now) };
  });
}
