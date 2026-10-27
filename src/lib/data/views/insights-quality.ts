/**
 * Veri kalitesi rozetleri (LLM'siz): bir hesabın sayısına neden fazla güvenilmemeli. Sıra sabittir: gizli beğeni, 3 günden genç
 * video, lift yok, az örnek, niş dışı. Sayım yoksa rozet yoktur (`count` ≥ 1). `offNiche`: konu eleğinden (`screen-topics`, LLM)
 * gelen niş dışı içerik kimlikleri; verilmezse ELEK ÇALIŞMAMIŞTIR ve rozet üretilmez (0 "niş dışı yok" demek olurdu).
 */
import type { ContentItem } from "@/lib/domain/content";
import type { DataQualityBadge, DataQualityKind } from "@/lib/domain/insights";
import { CONFIDENCE_HIGH_MIN_N } from "@/lib/domain/weekly-plan";

export function qualityBadges(videos: readonly ContentItem[], offNiche?: ReadonlySet<string>): DataQualityBadge[] {
  const total = videos.length;
  if (total === 0) return [];
  const badges: DataQualityBadge[] = [];
  const add = (kind: DataQualityKind, count: number, of = total) => {
    if (count > 0) badges.push({ kind, count, total: of });
  };
  add("hidden_likes", videos.filter((c) => c.metrics.likes === undefined).length);
  add("too_young", videos.filter((c) => c.score.immature).length);
  add("no_baseline", videos.filter((c) => c.score.lift === undefined).length);
  if (total < CONFIDENCE_HIGH_MIN_N) add("low_sample", total, CONFIDENCE_HIGH_MIN_N);
  if (offNiche !== undefined) add("off_niche", videos.filter((c) => offNiche.has(c.id)).length);
  return badges;
}
