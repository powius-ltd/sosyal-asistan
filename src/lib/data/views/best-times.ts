/**
 * En iyi paylaşım dilimleri görünümü (Genel bakış `bestTimes`). Depo uygulamalarının ortak hesabı: mock ve (Faz 1'de)
 * Supabase deposu AYNI süzgeci ve AYNI kullanıcıya görünen sebep metinlerini kullanır; dilim hesabı `lib/metrics`
 * `bestPostingSlots`'tadır (burada yalnız içerik süzgeci + sebep metni durur).
 */
import type { ContentItem } from "@/lib/domain/content";
import {
  BEST_TIMES_LIMIT,
  BEST_TIMES_LOOKBACK_DAYS,
  type BestTime,
  type Overview,
} from "@/lib/domain/overview";
import { BEST_SLOT_MIN_POSTS, bestPostingSlots } from "@/lib/metrics";
import { DAY_MS } from "@/lib/time";

/**
 * Kapsamdaki kendi içeriklerden (son `BEST_TIMES_LOOKBACK_DAYS` gün, olgunlaşmış, tarihi bilinen) en iyi paylaşım
 * dilimleri, medyan izlenmeye göre. İçerik süzgeci burada; kısa video + ölçülmüş izlenme + baskın `viewsKind` süzgeci
 * `bestPostingSlots`'ta. Yeterli veri yoksa `bestTimes` undefined + sebep (0 ya da rastgele dilim değil).
 */
export function buildBestTimes(
  ownItems: readonly ContentItem[],
  timeZone: string,
  nowMs: number,
): Pick<Overview, "bestTimes" | "bestTimesUnmeasuredReason"> {
  const since = nowMs - BEST_TIMES_LOOKBACK_DAYS * DAY_MS;
  const samples = ownItems
    .filter((c) => !c.score.immature && c.publishedAt !== undefined && new Date(c.publishedAt).getTime() >= since)
    .map((c) => ({
      format: c.format,
      views: c.metrics.views,
      viewsKind: c.metrics.viewsKind,
      publishedAt: c.publishedAt ? new Date(c.publishedAt) : undefined,
    }));
  const { slots, considered } = bestPostingSlots(samples, { timeZone, limit: BEST_TIMES_LIMIT });
  if (slots.length > 0) {
    const bestTimes: BestTime[] = slots.map((s) => ({ weekday: s.weekday, hour: s.hour, medianViews: s.medianViews, n: s.posts }));
    return { bestTimes };
  }
  return {
    bestTimesUnmeasuredReason:
      considered === 0
        ? `Son ${BEST_TIMES_LOOKBACK_DAYS} günde izlenmesi ölçülmüş, olgunlaşmış kendi kısa videon yok.`
        : `Son ${BEST_TIMES_LOOKBACK_DAYS} günde ${considered} kısa video incelendi; aynı gün ve saatte en az ${BEST_SLOT_MIN_POSTS} video yayınlanan zaman dilimi yok.`,
  };
}
