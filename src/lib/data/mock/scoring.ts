/**
 * Mock skorlaması: hesaplama `@/lib/metrics`'te (baz çizgisi, lift, kademe, crossScore — PLAN.md
 * "Metodoloji"); burada yalnız mock içerikleri o modülün girdisine çevirip sonucu yazarız.
 * Böylece mock ile gerçek (Supabase) skorlama aynı kodu kullanır, mantık iki yerde durmaz.
 *
 * Baz çizgisi hesabın (aynı sahibin) içeriklerinden gelir: aynı format ve viewsKind, sabitlenmiş ve
 * <3 günlük hariç. Skor önbelleği (`applyScores`) ve "bu lift neden böyle?" açıklaması
 * (`BaselineExplanation`, excluded sayaçları dahil) AYNI hesaplama anında, aynı girdiyle üretilir ve birlikte
 * saklanır; `getContent` sonradan yeniden hesaplamaz, saklananı döndürür (Supabase'de karşılığı
 * `content_items.baseline_excluded jsonb` — docs/PLAN.md "Veri modeli").
 */
import type { BaselineExplanation, ContentItem } from "@/lib/domain/content";
import { accountBaseline, BASELINE_DEFAULTS, scoreAccount, type ScorableItem } from "@/lib/metrics";

function toScorable(item: ContentItem): ScorableItem {
  return {
    id: item.id,
    format: item.format,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
    isPinned: item.isPinned,
    views: item.metrics.views,
    viewsKind: item.metrics.viewsKind,
  };
}

/** Sahip başına gruplama (kendi hesap / rakip + kimlik). */
function groupByOwner(items: ContentItem[]): ContentItem[][] {
  const byOwner = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = `${item.owner.kind}|${item.owner.id}`;
    const group = byOwner.get(key);
    if (group) group.push(item);
    else byOwner.set(key, [item]);
  }
  return [...byOwner.values()];
}

/**
 * Skor önbelleğini tüm içerikler için doldurur (yerinde) ve her içeriğin baz çizgisi açıklamasını AYNI
 * hesaplama anından döndürür (içerik kimliği → açıklama). Hesap (sahip) başına bir `scoreAccount`.
 */
export function applyScores(items: ContentItem[], nowMs: number): Map<string, BaselineExplanation> {
  const now = new Date(nowMs);
  const explanations = new Map<string, BaselineExplanation>();
  for (const group of groupByOwner(items)) {
    const scorable = group.map(toScorable);
    const scores = scoreAccount(scorable, group[0].owner.followers, now);
    group.forEach((item, i) => {
      item.score = scores.get(item.id) ?? item.score;
      explanations.set(item.id, explainBaseline(item, scorable[i], scorable, now));
    });
  }
  return explanations;
}

/** Ölçülemediyse (lift hesaplanamadıysa) neden: ekranda "Neden tutan?" kartında gösterilir. */
function unmeasuredReason(target: ContentItem, median: number | undefined, n: number): string | undefined {
  if (target.metrics.views === undefined) {
    return target.owner.kind === "competitor" && target.format !== "short_video"
      ? "Instagram karusel ve görsel gönderilerde herkese açık izlenme sayısı vermiyor; baz çizgisi ve lift hesaplanamaz."
      : "Bu içerikte izlenme ölçülemedi; baz çizgisi ve lift hesaplanamaz.";
  }
  // İzlenme türü bilinmiyorsa hiçbir içerikle karşılaştırılamaz (bilinmeyen tür hiçbir baz çizgisine girmez).
  if (target.metrics.viewsKind === undefined) {
    return "İzlenme türü bilinmiyor: farklı türler karıştırılamayacağı için baz çizgisi ve lift hesaplanamaz.";
  }
  if (n === 0) {
    return "Aynı hesapta aynı format ve izlenme türünde 3 günden eski, sabitlenmemiş başka içerik yok.";
  }
  if (median === undefined || !(median > 0)) {
    return "Baz çizgisinin medyan izlenmesi 0: izlenme bu değere bölünemediği için lift hesaplanamaz.";
  }
  return undefined;
}

function explainBaseline(
  target: ContentItem,
  scorableTarget: ScorableItem,
  owned: readonly ScorableItem[],
  now: Date,
): BaselineExplanation {
  const baseline = accountBaseline(owned, scorableTarget, { now });
  return {
    viewsKind: target.metrics.viewsKind,
    format: target.format,
    targetViews: target.metrics.views,
    medianViews: baseline.median,
    windowSize: BASELINE_DEFAULTS.window,
    n: baseline.n,
    lowConfidence: baseline.lowConfidence,
    basis: baseline.basis.map((b) => ({
      contentItemId: b.id,
      views: b.views,
      publishedAt: b.publishedAt.toISOString(),
    })),
    excluded: {
      self: baseline.excluded.self,
      otherFormat: baseline.excluded.otherFormat,
      pinned: baseline.excluded.pinned,
      noViews: baseline.excluded.noViews,
      differentViewsKind: baseline.excluded.otherKind,
      noDate: baseline.excluded.noDate,
      tooYoung: baseline.excluded.young,
    },
    unmeasuredReason: unmeasuredReason(target, baseline.median, baseline.n),
  };
}
