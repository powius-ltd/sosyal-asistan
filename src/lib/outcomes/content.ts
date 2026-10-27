/**
 * Ölçüm/geçen hafta hesabının içerik girdisi: bir kendi Reels'in hesap için gereken olguları (yayın, süre, açıklama, baz çizgisi,
 * analiz hook'u, ölçüm noktaları). Mock (`ContentItem` + `MetricSnapshot`) ve Supabase (satırlar) bunu üretir; hesap
 * (`checkpoints`, `verdict`, `review`, `due`) yalnız bu tipi okur — iki depo AYNI fonksiyonları çağırır.
 */
import type { ContentItem, MetricSnapshot } from "@/lib/domain/content";
import type { ContentAnalysis } from "@/lib/domain/intel";
import type { SnapshotPoint } from "@/lib/outcomes/checkpoints";
import type { ViewsKind } from "@/lib/platforms/types";

export interface OutcomeContent {
  id: string;
  ownerHandle: string;
  shortcode?: string;
  url?: string;
  publishedAt?: string;
  durationSec?: number;
  caption?: string;
  /** Hesabın güncel takipçisi (ölçümde takipçi yoksa yedek). */
  followers?: number;
  baselineViews?: number;
  baselineViewsKind?: ViewsKind;
  /** Yalnız `ok` + kanıtı doğrulanmış analizin hook türü (yoksa undefined: yön hükmü fikirden bakar). */
  analysisHookType?: string;
  snapshots: SnapshotPoint[];
}

type AnalysisRef = Pick<ContentAnalysis, "status" | "hookType" | "evidenceVerified">;

/** Analizden hook türü: yalnız `ok` ve kanıtı doğrulanmış etiket güvenilir sayılır (içgörü grupları ile aynı kural). */
export function verifiedAnalysisHookType(analysis: AnalysisRef | undefined): string | undefined {
  return analysis?.status === "ok" && analysis.evidenceVerified && analysis.hookType ? analysis.hookType : undefined;
}

/** `ContentItem` + ölçümler → hesap girdisi (mock yolu). */
export function toOutcomeContent(item: ContentItem, snapshots: readonly MetricSnapshot[], analysis?: AnalysisRef): OutcomeContent {
  return {
    id: item.id,
    ownerHandle: item.owner.handle,
    shortcode: item.shortcode,
    url: item.url,
    publishedAt: item.publishedAt,
    durationSec: item.durationSec,
    caption: item.caption,
    followers: item.owner.followers,
    baselineViews: item.score.baselineViews,
    baselineViewsKind: item.score.viewsKind,
    analysisHookType: verifiedAnalysisHookType(analysis),
    snapshots: snapshots.map((s) => ({ capturedAt: s.capturedAt, views: s.views, viewsKind: s.viewsKind })),
  };
}
