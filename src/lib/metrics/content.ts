/**
 * İçerik korelasyonları ve hashtag frekansı — Python `core/metrics/content.py` paritesi.
 *
 * Korelasyon saf Pearson'dır (`stats.pearson`, pandas yok), Python gibi 3 haneye yuvarlanır.
 * Sapma (bilinçli, undefined ≠ 0): Python caption'ı olmayanı 0 karakter, hashtag listesi olmayanı
 * 0 etiket sayar; burada caption / hashtags `undefined` olan içerik o korelasyona hiç girmez.
 * Boş caption ("") ölçülmüş 0 karakterdir ve girer.
 */
import { engagementOf } from "@/lib/metrics/engagement";
import { mean, median, pearson, pyRound } from "@/lib/metrics/stats";
import type { MetricItem } from "@/lib/metrics/types";
import type { ViewsKind } from "@/lib/platforms/types";

export interface Correlation {
  label: string;
  pearsonR?: number;
  n: number;
}

function correlation(label: string, pairs: readonly (readonly [number, number])[]): Correlation {
  const r = pearson(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
  return { label, pearsonR: r === undefined ? undefined : pyRound(r, 3), n: pairs.length };
}

/** Caption uzunluğu (Unicode kod noktası; Python `len` ile aynı, emoji = 1) ↔ etkileşim. */
export function captionLengthCorrelation(items: readonly MetricItem[]): Correlation {
  const pairs: [number, number][] = [];
  for (const it of items) {
    const e = engagementOf(it);
    if (e !== undefined && it.caption !== undefined) pairs.push([[...it.caption].length, e]);
  }
  return correlation("caption_uzunlugu_vs_etkilesim", pairs);
}

/** Hashtag sayısı ↔ etkileşim. */
export function hashtagCountCorrelation(items: readonly MetricItem[]): Correlation {
  const pairs: [number, number][] = [];
  for (const it of items) {
    const e = engagementOf(it);
    if (e !== undefined && it.hashtags !== undefined) pairs.push([it.hashtags.length, e]);
  }
  return correlation("hashtag_sayisi_vs_etkilesim", pairs);
}

/**
 * Video süresi ↔ views (Python'da yok; ARASTIRMA.md §3 "Reel süresi ↔ play count").
 * Yalnız verilen viewsKind içinde (farklı views türleri karışmaz).
 */
export function durationViewsCorrelation(items: readonly MetricItem[], viewsKind: ViewsKind): Correlation {
  const pairs: [number, number][] = [];
  for (const it of items) {
    if (it.viewsKind !== viewsKind || it.views === undefined || it.durationSec === undefined) continue;
    pairs.push([it.durationSec, it.views]);
  }
  return correlation("sure_vs_izlenme", pairs);
}

export interface HashtagStat {
  /** Küçük harfe indirilmiş etiket. */
  tag: string;
  uses: number;
  /** Sıralama anahtarı — ortalama DEĞİL. */
  medianEngagement: number;
  meanEngagement: number;
}

/**
 * Etiketleri MEDYAN etkileşime göre sıralar (azalan; eşitlikte ilk görülen önce).
 * `minUses` varsayılanı 3: n = 2'de medyan = ortalama olur, tek viral gönderi iki kez
 * kullanılmış bir etiketi başa taşır. Sağlam merkezi eğilim için en az 3 gözlem gerekir.
 */
export function hashtagFrequency(items: readonly MetricItem[], o: { minUses?: number } = {}): HashtagStat[] {
  const minUses = o.minUses ?? 3;
  const buckets = new Map<string, number[]>();
  for (const it of items) {
    const e = engagementOf(it);
    if (e === undefined) continue;
    for (const raw of it.hashtags ?? []) {
      const tag = raw.toLowerCase();
      const bucket = buckets.get(tag);
      if (bucket) bucket.push(e);
      else buckets.set(tag, [e]);
    }
  }
  const out: HashtagStat[] = [];
  for (const [tag, values] of buckets) {
    const med = median(values);
    const avg = mean(values);
    if (values.length < minUses || med === undefined || avg === undefined) continue;
    out.push({ tag, uses: values.length, medianEngagement: pyRound(med, 1), meanEngagement: pyRound(avg, 1) });
  }
  return out.sort((a, b) => b.medianEngagement - a.medianEngagement);
}
