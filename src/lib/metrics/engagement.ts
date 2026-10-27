/**
 * Etkileşim metrikleri — Python `core/metrics/engagement.py` paritesi.
 *
 * Tamamen deterministik; buradaki hiçbir sayı LLM'den geçmez.
 * Yuvarlamalar Python'la aynı (`pyRound`): ER 4 hane, etkileşim 1 hane, izlenme oranı 3 hane.
 * Tek bilinçli sapma: `engagementOf` (biri eksikse undefined) — ayrıntı fonksiyonun yorumunda.
 */
import { mean, median, pyRound } from "@/lib/metrics/stats";
import type { MetricItem } from "@/lib/metrics/types";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";

/**
 * likes + comments. Biri ya da ikisi ölçülemediyse (undefined) etkileşim de undefined'dır:
 * eksik olan alan 0 sayılmaz (`undefined ≠ 0`).
 *
 * BİLİNÇLİ SAPMA (Python paritesi bozulur): Python `ContentItem.engagement` yalnız biri varsa
 * diğerini 0 sayar ve toplamı döndürür. Panelde bu, ölçülemeyeni sıfır yazmak olurdu (ör. yalnız
 * yorum sayısı gelen ve beğenisi gizli bir rakip içeriği "3 etkileşim" görünürdü); bu yüzden ikisi
 * de ölçülmüşse hesaplanır. Etkilenen tüm türevler (ER, medyan etkileşim, persentil dilimi)
 * yalnız iki alanı da olan içerikten hesaplanır. İkisi de ölçülmüşse sonuç Python'la birebir aynıdır.
 */
export function engagementOf(it: Pick<MetricItem, "likes" | "comments">): number | undefined {
  if (it.likes === undefined || it.comments === undefined) return undefined;
  return it.likes + it.comments;
}

function hasFollowers(followers: number | undefined): followers is number {
  return followers !== undefined && Number.isFinite(followers) && followers > 0;
}

/** Takipçi tabanlı ER listesi (yüzde, 4 hane). Takipçi bilinmiyor/0 → boş liste. */
export function engagementRates(items: readonly MetricItem[], followers: number | undefined): number[] {
  if (!hasFollowers(followers)) return [];
  const out: number[] = [];
  for (const it of items) {
    const e = engagementOf(it);
    if (e !== undefined) out.push(pyRound((e / followers) * 100, 4));
  }
  return out;
}

function round(value: number | undefined, digits: number): number | undefined {
  return value === undefined ? undefined : pyRound(value, digits);
}

export interface EngagementStats {
  /** Etkileşimi ölçülebilen içerik sayısı. */
  count: number;
  /** Takipçi tabanlı, yüzde. */
  meanEr?: number;
  /** Asıl gösterge — viral outlier'a dayanıklı. */
  medianEr?: number;
  meanEngagement?: number;
  medianEngagement?: number;
}

export function computeEngagementStats(
  items: readonly MetricItem[],
  followers: number | undefined,
): EngagementStats {
  const engagements: number[] = [];
  for (const it of items) {
    const e = engagementOf(it);
    if (e !== undefined) engagements.push(e);
  }
  if (engagements.length === 0) return { count: 0 };

  const ers = engagementRates(items, followers);
  return {
    count: engagements.length,
    meanEr: round(mean(ers), 4),
    medianEr: round(median(ers), 4),
    meanEngagement: round(mean(engagements), 1),
    medianEngagement: round(median(engagements), 1),
  };
}

export interface FormatBreakdown {
  format: ContentFormat;
  count: number;
  meanEr?: number;
  medianEr?: number;
}

/** Formata göre ER kırılımı; sayıya göre azalan (eşitlikte ilk görülen önce). */
export function computeFormatBreakdown(
  items: readonly MetricItem[],
  followers: number | undefined,
): FormatBreakdown[] {
  const byFormat = new Map<ContentFormat, MetricItem[]>();
  for (const it of items) {
    const group = byFormat.get(it.format);
    if (group) group.push(it);
    else byFormat.set(it.format, [it]);
  }
  const out: FormatBreakdown[] = [];
  for (const [format, group] of byFormat) {
    const s = computeEngagementStats(group, followers);
    out.push({ format, count: s.count, meanEr: s.meanEr, medianEr: s.medianEr });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface PlayRate {
  viewsKind: ViewsKind;
  count: number;
  /** views / takipçi × 100 (3 hane). */
  meanPlayRate?: number;
  medianPlayRate?: number;
}

/**
 * Kısa video izlenme oranı (views / takipçi). Python tek sayı döndürür ve play/view'i
 * karıştırır; burada viewsKind başına ayrı grup döner (viewsKind'ı bilinmeyen views hiçbir gruba girmez).
 */
export function computeReelPlayRate(
  items: readonly MetricItem[],
  followers: number | undefined,
): PlayRate[] {
  const byKind = new Map<ViewsKind, number[]>();
  for (const it of items) {
    if (it.format !== "short_video" || it.views === undefined || it.viewsKind === undefined) continue;
    const plays = byKind.get(it.viewsKind);
    if (plays) plays.push(it.views);
    else byKind.set(it.viewsKind, [it.views]);
  }
  const out: PlayRate[] = [];
  for (const [viewsKind, plays] of byKind) {
    if (!hasFollowers(followers)) {
      out.push({ viewsKind, count: plays.length });
      continue;
    }
    const rates = plays.map((p) => pyRound((p / followers) * 100, 3));
    out.push({
      viewsKind,
      count: plays.length,
      meanPlayRate: round(mean(rates), 3),
      medianPlayRate: round(median(rates), 3),
    });
  }
  return out;
}

/**
 * 2026 sektör ER benchmark bantları — takipçi tabanlı, yüzde.
 * Üçüncü taraf raporlarından derlenmiştir; ekranda/raporda bu dipnotla birlikte sunulmalı.
 */
export const BENCHMARK_SOURCE =
  "2026 sektör raporları (creatorflow.so/blog/instagram-engagement-rate-benchmarks-2026, " +
  "reeldrop.io/learn/instagram-engagement-rate) — yayın-insta-denem ARASTIRMA.md §3";

export const BENCHMARK_BANDS = [
  { min: 0, max: 10_000, expectedErPct: 7.0, label: "Nano (<10K)" },
  { min: 10_000, max: 50_000, expectedErPct: 3.5, label: "Micro (10-50K)" },
  { min: 50_000, max: 500_000, expectedErPct: 1.6, label: "Mid (50-500K)" },
  { min: 500_000, max: Number.POSITIVE_INFINITY, expectedErPct: 0.65, label: "Macro/Mega (500K+)" },
] as const;

export interface BenchmarkBand {
  expectedErPct: number;
  label: string;
  source: string;
}

/** Takipçi sayısının bandı (alt sınır dahil, üst hariç). Takipçi bilinmiyor/0 → undefined. */
export function benchmarkBand(followers: number | undefined): BenchmarkBand | undefined {
  if (!followers) return undefined;
  for (const b of BENCHMARK_BANDS) {
    if (b.min <= followers && followers < b.max) {
      return { expectedErPct: b.expectedErPct, label: b.label, source: BENCHMARK_SOURCE };
    }
  }
  return undefined;
}

// ------------------------------------------------- Etkileşim oranı (genel bakış KPI'ı)

/** İçerik başına etkileşim oranı girdisi: beğeni, yorum ve içeriğin sahibinin takipçisi. */
export interface RateInput {
  likes?: number;
  comments?: number;
  followers?: number;
}

/**
 * İçerik başına etkileşim oranı (ORAN, yüzde değil): (likes + comments) / takipçi. Beğeni ya da yorum
 * ölçülemediyse (`engagementOf`), takipçi bilinmiyor/0 ise ya da sonuç geçersizse undefined — o içerik
 * hesaba girmez (eksik alan 0 sayılmaz).
 */
export function contentEngagementRate(it: RateInput): number | undefined {
  const engagement = engagementOf(it);
  if (engagement === undefined || !(engagement >= 0) || !hasFollowers(it.followers)) return undefined;
  const rate = engagement / it.followers;
  return Number.isFinite(rate) ? rate : undefined;
}

/**
 * Medyan etkileşim oranı — Genel bakış KPI'ı ("Medyan etkileşim oranı (takipçiye göre)"). Pay (beğeni + yorum)
 * ve payda (takipçi) AYNI içerik kümesinden gelir: oranı hesaplanamayan içerik hem kümeden hem medyandan çıkar.
 * Ortalama yerine medyan: tek viral içerik göstergeyi bozmasın. Hesaplanabilen içerik yoksa undefined (0 değil).
 * Girdi çağıranın seçtiği içerik kümesidir (ör. son 30 günde yayınlananlar); zaman penceresi burada bilinmez.
 */
export function medianEngagementRate(items: readonly RateInput[]): number | undefined {
  const rates: number[] = [];
  for (const it of items) {
    const rate = contentEngagementRate(it);
    if (rate !== undefined) rates.push(rate);
  }
  return median(rates);
}
