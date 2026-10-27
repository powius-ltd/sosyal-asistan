/**
 * Viral av eşikleri ve tavanı — TEK yer. Çalışma alanı başına değiştirilebilir DEĞİL (şimdilik sabit; SPEC kararı, kullanıcı 2026-10-19 metodolojisi
 * "takipçiye göre katsayısı yüksek"). Patlamış = izlenme / yazar takipçisi ≥ 3 VE izlenme ≥ 10.000 VE yaş ≤ 30 gün.
 */
import { DAY_MS } from "@/lib/time";

export const VIRAL_THRESHOLDS = {
  /** İzlenme / yazar takipçisi en az bu kadar olmalı. */
  minViewsPerFollower: 3,
  /** Tek başına yeterli değil: küçük hesabın küçük sayısı "patlamış" sayılmaz. */
  minViews: 10_000,
  /** Yayın yaşı üst sınırı (gün). */
  maxAgeDays: 30,
} as const;

/** Haftalık Apify tavanı (USD; konu × platform × sonuç + IG profil çağrısı). Bunun üstünde `--apify-max` verilemez. */
export const VIRAL_WEEKLY_CAP_USD = 1.5;
/** Bir koşuda (hafta) en çok konu / platform. */
export const VIRAL_MAX_TOPICS = 3;
/** Sorgu başına istenen sonuç (aktörün sorgu başına sınırı). */
export const VIRAL_RESULTS_PER_QUERY = 50;
/**
 * Kuru koşu tahmininde Instagram'da profil çağrısı gereken yazar payı (eşiği ön süzgeçten geçen yazar / sonuç; muhafazakâr üst tahmin).
 * Gerçek koşuda profil çağrısı kalan tavana göre küçülür (`affordableCount`).
 */
export const VIRAL_PROFILE_SHARE_ESTIMATE = 0.5;

/** İzlenme / takipçi. Takipçi yoksa ya da 0 ise `undefined` (ölçülemedi; 0 ya da sonsuz uydurulmaz). */
export function viralRatio(views: number, followers: number | undefined): number | undefined {
  if (followers === undefined || !Number.isFinite(followers) || followers <= 0) return undefined;
  if (!Number.isFinite(views) || views < 0) return undefined;
  return views / followers;
}

/** Yayından bu yana geçen gün; tarih çözülemezse `undefined`. */
export function ageDays(publishedAt: string, now: Date): number | undefined {
  const ms = Date.parse(publishedAt);
  return Number.isNaN(ms) ? undefined : (now.getTime() - ms) / DAY_MS;
}

/** Yaş ve izlenme eşiklerini geçiyor mu (takipçiden bağımsız ön süzgeç: profil çağrısı yalnız bunlar için yapılır). */
export function passesPrefilter(video: { views: number; publishedAt: string }, now: Date): boolean {
  const age = ageDays(video.publishedAt, now);
  // Küçük saat farkı (yayın damgası "şimdi"nin birkaç saat ilerisi) tolere edilir; daha ilerisi bozuk veridir.
  return video.views >= VIRAL_THRESHOLDS.minViews && age !== undefined && age >= -1 && age <= VIRAL_THRESHOLDS.maxAgeDays;
}

/** Üç eşiğin hepsi: oran ölçülemiyorsa geçmez. */
export function isViral(video: { views: number; authorFollowers?: number; publishedAt: string }, now: Date): boolean {
  const ratio = viralRatio(video.views, video.authorFollowers);
  return ratio !== undefined && ratio >= VIRAL_THRESHOLDS.minViewsPerFollower && passesPrefilter(video, now);
}
