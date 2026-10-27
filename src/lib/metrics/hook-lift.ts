/**
 * Hook türü × format grubuna göre lift tablosu (docs/FAZ2-PLAN.md §2b "hook-lift"): hangi açılış türü hangi formatta baz
 * çizgisinin ne kadar üstünde/altında kalıyor. LLM yok; hook türü video analizinden gelir (`ContentAnalysis.hookType`), lift
 * `lib/metrics` skorundandır. Kurallar:
 *  - Lift'i ölçülemeyen ya da olgunlaşmamış (<3 gün) içerik `n`'e GİRMEZ (ölçülemedi ≠ lift 0); yalnız `unmeasured`'a sayılır.
 *  - Analizi olmayan içerik (hook türü yok) tabloya hiç girmez: "analiz yok" bir hook türü değildir.
 *  - Kendi ve rakip AYRI tutulabilir (`hookLiftByOwner`) ya da süzülebilir (`owner`); karıştırılırsa yalnız çağıran isteyerek.
 *  - Güven örnek sayısından: ≥ 10 yüksek, ≥ 5 orta, aksi düşük (`confidenceForSample`); ölçülmüş örneklerin ≥ %50'si baz çizgisi
 *    düşük güvenliyse (`LiftSample.lowBaseline`) en çok orta (`capConfidenceForBaseline`).
 * `summarizeLiftSamples` tek lift özeti kuralıdır (`summarizeLifts` baz çizgisi bilgisiz kısayoludur); süre/CTA/hook grupları
 * (`data/views/insights-groups.ts`) ve plan yönleri (`lib/insights/groups.ts`) da bunu kullanır.
 */
import { liftTierFor, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { capConfidenceForBaseline, confidenceForSample, type ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { median } from "@/lib/metrics/stats";
import type { ContentFormat } from "@/lib/platforms/types";

/** ≥ 3x (`OUTLIER_MIN_TIER`) tutan lift mü. Ölçülemeyen lift tutan sayılmaz. */
export function isOutlierLift(lift: number | undefined): boolean {
  const tier = liftTierFor(lift);
  return tier !== undefined && tier >= OUTLIER_MIN_TIER;
}

export interface LiftSummary {
  /** Lift'i ölçülmüş örnek sayısı (ölçülemeyenler girmez). */
  n: number;
  /** Medyan lift; hiçbirinin lift'i ölçülemediyse undefined (0 değil). */
  medianLift?: number;
  /** ≥ 3x tutan sayısı (yalnız ölçülenler arasında). */
  outlierCount: number;
  /** Örnek sayısından güven, baz çizgisi tavanı uygulanmış (`lowBaselineShare` ≥ %50 ise en çok orta). */
  confidence: ConfidenceLevel;
  /**
   * Ölçülmüş örneklerin baz çizgisi düşük güvenli olanlarının payı (0..1), yalnız baz çizgisi bilgisi olan örnekler arasında.
   * Ölçülmüş örnek ya da bilgi yoksa undefined (0 değil): tavan uygulanmaz.
   */
  lowBaselineShare?: number;
}

/** Bir örnek: lift + baz çizgisi güveni. `lowBaseline` bilinmiyorsa (undefined) tavan hesabına girmez. */
export interface LiftSample {
  /** Ölçülemeyen (undefined), sonlu olmayan ve negatif lift `n`'e girmez. */
  lift?: number;
  /** Baz çizgisi düşük güvenli mi (`ContentScore.lowConfidence`: baz çizgisi < 10 içerik). */
  lowBaseline?: boolean;
}

/** Örneklerden özet: medyan, tutan sayısı, güven (örnek sayısı + baz çizgisi tavanı). `undefined`/sonlu olmayan/negatif lift `n`'e girmez. */
export function summarizeLiftSamples(samples: readonly LiftSample[]): LiftSummary {
  const measured = samples.filter((s): s is LiftSample & { lift: number } => s.lift !== undefined && Number.isFinite(s.lift) && s.lift >= 0);
  const withBaseline = measured.filter((s) => s.lowBaseline !== undefined);
  const lowBaselineShare = withBaseline.length === 0 ? undefined : withBaseline.filter((s) => s.lowBaseline === true).length / withBaseline.length;
  const lifts = measured.map((s) => s.lift);
  return {
    n: measured.length,
    medianLift: median(lifts),
    outlierCount: lifts.filter(isOutlierLift).length,
    confidence: capConfidenceForBaseline(confidenceForSample(measured.length), lowBaselineShare),
    lowBaselineShare,
  };
}

/** Lift listesinden özet (baz çizgisi bilgisi yok → tavan uygulanmaz). Ayrıntı: `summarizeLiftSamples`. */
export function summarizeLifts(lifts: readonly (number | undefined)[]): LiftSummary {
  return summarizeLiftSamples(lifts.map((lift) => ({ lift })));
}

export interface HookLiftSample {
  /** Doğrulanmış analizdeki hook türü; analiz yoksa undefined (örnek tabloya girmez). */
  hookType?: string;
  format: ContentFormat;
  owner: "own" | "competitor";
  lift?: number;
  /** Baz çizgisi düşük güvenli mi (`ContentScore.lowConfidence`); verilmezse güven tavanı uygulanmaz. */
  lowBaseline?: boolean;
  /** <3 gün: izlenme olgunlaşmadı, lift yanıltıcı (alt sınır); `n`'e girmez. */
  immature?: boolean;
}

export interface HookLiftRow extends LiftSummary {
  hookType: string;
  format: ContentFormat;
  /** Gruptaki analizli içerik sayısı (lift'i ölçülemeyenler dahil). */
  total: number;
  /** `n`'e girmeyen içerik sayısı: lift ölçülemedi ya da olgunlaşmamış. */
  unmeasured: number;
}

export interface HookLiftOptions {
  /** Yalnız kendi ya da yalnız rakip içerikleri. Verilmezse hepsi (karışık). */
  owner?: "own" | "competitor";
}

/** Medyan lift azalan (ölçülemeyen sonda), sonra `n`, sonra hook türü ve format (deterministik). */
function byLiftDesc(a: HookLiftRow, b: HookLiftRow): number {
  return (
    (b.medianLift ?? Number.NEGATIVE_INFINITY) - (a.medianLift ?? Number.NEGATIVE_INFINITY) ||
    b.n - a.n ||
    a.hookType.localeCompare(b.hookType) ||
    a.format.localeCompare(b.format)
  );
}

/** Hook türü × format tablosu. Boş girdi → []. */
export function hookLiftTable(samples: readonly HookLiftSample[], options: HookLiftOptions = {}): HookLiftRow[] {
  const groups = new Map<string, { hookType: string; format: ContentFormat; lifts: LiftSample[] }>();
  for (const sample of samples) {
    if (sample.hookType === undefined || sample.hookType === "") continue;
    if (options.owner !== undefined && sample.owner !== options.owner) continue;
    const key = `${sample.hookType}|${sample.format}`;
    const group = groups.get(key) ?? { hookType: sample.hookType, format: sample.format, lifts: [] };
    group.lifts.push({ lift: sample.immature === true ? undefined : sample.lift, lowBaseline: sample.lowBaseline });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ hookType, format, lifts }): HookLiftRow => {
      const summary = summarizeLiftSamples(lifts);
      return { hookType, format, ...summary, total: lifts.length, unmeasured: lifts.length - summary.n };
    })
    .sort(byLiftDesc);
}

/** Kendi ve rakip grupları ayrı (`GroupedLift` ile aynı ayrım). */
export function hookLiftByOwner(samples: readonly HookLiftSample[]): { own: HookLiftRow[]; competitors: HookLiftRow[] } {
  return { own: hookLiftTable(samples, { owner: "own" }), competitors: hookLiftTable(samples, { owner: "competitor" }) };
}
