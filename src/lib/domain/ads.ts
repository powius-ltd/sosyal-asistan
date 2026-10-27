/**
 * Reklam: panelin üçüncü veri kaynağı (`docs/REKLAM-MODUL-PLAN.md` §7). v1 OKUR ve ÖNERİR; reklam hesabına yazan hiçbir tip, metot ya da
 * uç yoktur (`lib/ads/no-write.test.ts` tutar). Veri yalnız resmi API'den gelir (`lib/ads/provider.ts` arayüzü arkasında).
 *
 * Kurallar: ölçülemeyen her alan `undefined`'dır (0 değil): 0 gösterimde oran, sonuç eylemi tanımsız hesapta sonuç maliyeti, hedefsiz hesapta
 * karar ölçülemez. Para her zaman hesabın kendi para biriminde saklanır; farklı birimli hesapların toplamı BİRLEŞTİRİLMEZ. Tarihler
 * "YYYY-AA-GG" (hesabın saat diliminde gün). Karar kuralları R1'in (`lib/ads/**`); burada yalnız tipler, eşikler ve ölçü hesabı durur.
 */
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

// ------------------------------------------------------------------- Listeler

/** Reklam veri sağlayıcısı. Yeni sağlayıcı = migration CHECK + bu liste birlikte (`ads.test.ts` SQL ile karşılaştırır). */
export const AD_PROVIDERS = ["zernio"] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];

/** Hesap durumu (sağlayıcıdan okunur). */
export const AD_ACCOUNT_STATUSES = ["active", "disabled", "unknown"] as const;
export type AdAccountStatus = (typeof AD_ACCOUNT_STATUSES)[number];

/** Kampanya / reklam seti / reklam durumu (sağlayıcıdan okunur; panel değiştirmez). */
export const AD_ENTITY_STATUSES = ["active", "paused", "archived", "unknown"] as const;
export type AdEntityStatus = (typeof AD_ENTITY_STATUSES)[number];

/** Kreatif biçimi. */
export const AD_FORMATS = ["video", "image", "carousel", "unknown"] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

/** Hedef türü: `value` getiri (harcanan paraya dönen), `cost` sonuç başına hedef maliyet. */
export const AD_GOAL_KINDS = ["value", "cost"] as const;
export type AdGoalKind = (typeof AD_GOAL_KINDS)[number];

/**
 * Reklam kararı. `scale` artır · `hold` bekle · `reduce` azalt · `stop` kapat · `fatigued` yoruldu · `learning` öğreniyor ·
 * `insufficient_data` veri az · `undecided` karar verilemez (hedef yok ya da kurallar henüz yok).
 */
export const AD_VERDICT_STATUSES = ["scale", "hold", "reduce", "stop", "fatigued", "learning", "insufficient_data", "undecided"] as const;
export type AdVerdictStatus = (typeof AD_VERDICT_STATUSES)[number];

// ------------------------------------------------------------------- Eşikler

/**
 * Karar kuralı eşikleri (plan §5 ve §7; R1 kullanır). Hepsi BAŞLANGIÇ değeridir, veriyle sınanmadı; adlandırılmış sabit olarak durur ki
 * kural kodunda sayı gömülmesin. `[V]` işaretli olanlar planda sayısı yazmayan, bizim koyduğumuz değerlerdir.
 */
export const DEFAULT_AD_RULES = {
  /** Hücrenin reklam güveni: yargılanmış kreatif sayısı bunun ALTINDAYSA düşük. */
  cellMinJudgedForConfidence: 3,
  /** Getiri modu: hedef getirinin bu katının altı → azalt. */
  reduceBelowTargetShare: 0.7,
  /** Getiri modu: hedef getirinin bu katının üstü (istikrarlıysa) → artır. */
  scaleAboveTargetMultiple: 1.2,
  /** Getiri modu: başabaş getirisi (altı → kapat). */
  breakEvenReturn: 1,
  /** Sonuç-maliyeti modu [V]: hedef maliyetin bu katının üstü → kapat. */
  costStopAboveTargetMultiple: 2,
  /** Sonuç-maliyeti modu [V]: hedef maliyetin bu katının üstü → azalt. */
  costReduceAboveTargetMultiple: 1.3,
  /** Sonuç-maliyeti modu [V]: hedef maliyetin bu katının altı → artır. */
  costScaleBelowTargetMultiple: 0.8,
  /** Yorgunluk: görülme sıklığı bunu AŞARSA ve tıklama oranı düşmüşse. */
  fatigueFrequencyMin: 3,
  /** Yorgunluk: tıklama oranı ilk 7 gün → son 7 gün ortalamasında bu pay kadar düşmüşse. */
  fatigueCtrDropShare: 0.25,
  /** Yorgunluk: bundan az günlük veriyle ölçülemez (`undefined` + sebep). */
  fatigueMinDays: 14,
  /** İstikrar: bundan az harcamalı günle ölçülemez. */
  stabilityMinSpendDays: 7,
  /** İstikrar [V]: günlük sonuç maliyetinin değişim katsayısı bunun altındaysa istikrarlı. */
  stabilityMaxVariation: 0.5,
  /** Ani kötüleşme: son 7 gün sonuç maliyeti, önceki 21 günün bu katının üstündeyse. */
  worseningMultiple: 1.3,
  worseningRecentDays: 7,
  worseningBaselineDays: 21,
  /** Ani kötüleşme: bundan az günlük veriyle ölçülemez. */
  worseningMinDays: 28,
  /** İniş sayfası şüphesi: tıklama oranı bunun ÜSTÜNDE ve sonuç oranı aşağıdakinin ALTINDAYSA artır yerine bekle. */
  landingSuspectCtr: 0.03,
  landingSuspectResultRate: 0.005,
  /** Sonuç kapısı [V]: bundan az sonuçla `stop` verilmez (küçük harcamada kapatma kararı verilmez). */
  stopMinResults: 5,
  /** Öğrenme [V]: yayına gireli bu kadar günden azsa karar `learning`. */
  learningDays: 3,
} as const;

/** Hücrede gösterilen en çok reklam örneği. */
export const AD_CELL_SAMPLES_MAX = 3;

/** Reklam başvurusu (`ad:<adId>`; panelin iç kimliği). */
export const AD_REF_PREFIX = "ad:";
export const adRefOf = (adId: string): string => `${AD_REF_PREFIX}${adId}`;

// --------------------------------------------------------------- Varlıklar

/** Para tutarı: para birimiyle birlikte (birimsiz tutar yazılmaz; farklı birimler toplanmaz). */
export interface AdMoney {
  amount: number;
  /** ISO 4217 ("TRY", "USD"). */
  currency: string;
}

/** Hesabın hedefi. Hedef yoksa o hesabın hiçbir reklamı karar almaz (`undecided` + sebep). */
export interface AdGoal {
  kind: AdGoalKind;
  /** Sonucun adı ("satın alma", "form"): hesabın sonuç eylemi. */
  resultLabel: string;
  /** `value` modu: hedef getiri (harcanan paraya dönen). */
  targetReturn?: number;
  /** `value` modu: brüt kâr payı (0–1); başabaş getirisi buradan türer. */
  grossMargin?: number;
  /** `cost` modu: sonuç başına hedef maliyet (hesabın para biriminde). */
  targetCostPerResult?: number;
}

export interface AdAccount {
  id: string;
  workspaceId: string;
  provider: AdProvider;
  /** Sağlayıcıdaki hesap kimliği ("act_…"). */
  externalAccountId: string;
  /** Sağlayıcının (Zernio) hesap kimliği. */
  providerAccountId?: string;
  label?: string;
  /** Hesabın kendi para birimi (ISO 4217). */
  currency: string;
  status: AdAccountStatus;
  goal?: AdGoal;
}

export interface AdCampaign {
  id: string;
  accountId: string;
  externalId: string;
  name: string;
  status: AdEntityStatus;
}

export interface AdSet {
  id: string;
  campaignId: string;
  externalId: string;
  name: string;
  status: AdEntityStatus;
  /** Sağlayıcıdan OKUNAN günlük bütçe (hesabın para biriminde); panel yazmaz. */
  dailyBudget?: number;
}

export interface AdCreative {
  id: string;
  externalId?: string;
  format: AdFormat;
  aspect?: string;
  /** Kreatif kendi içeriğiyse o içerik (`content_items`); dış reklamda yok. */
  sourceContentId?: string;
}

export interface Ad {
  id: string;
  adSetId: string;
  externalId: string;
  name: string;
  status: AdEntityStatus;
  creativeId?: string;
  /** Yayına girdiği gün (YYYY-AA-GG); bilinmiyorsa yok. */
  startedOn?: string;
}

/** Bir reklamın bir günlük ölçüsü. Yalnız adı geçen alanlar ölçülmüşse dolu; ölçülmeyen `undefined` (0 değil). */
export interface AdDailyMetric {
  adId: string;
  /** YYYY-AA-GG. */
  date: string;
  spend: number;
  impressions: number;
  clicks?: number;
  results?: number;
  /** Sonuçların parasal değeri (getiri hesabı); gelir ölçülmüyorsa yok. */
  resultValue?: number;
  frequency?: number;
  reach?: number;
  video3sViews?: number;
  videoThruplays?: number;
  avgWatchSec?: number;
}

// -------------------------------------------------------------------- Ölçüler

/** Günlük satırların toplamı. İsteğe bağlı alan, hiçbir günde ölçülmediyse `undefined` kalır (0 değil). */
export interface AdMetricSums {
  spend: number;
  impressions: number;
  clicks?: number;
  results?: number;
  resultValue?: number;
  video3sViews?: number;
  videoThruplays?: number;
  /** Ölçüm olan gün sayısı. */
  days: number;
}

/** Toplamdan türeyen oranlar; payda 0 ya da ölçülmemişse `undefined`. */
export interface AdMetrics {
  /** Tıklama oranı: tıklama / gösterim. */
  clickRate?: number;
  /** Tıklama başı maliyet. */
  costPerClick?: number;
  /** Bin gösterim maliyeti. */
  costPerThousand?: number;
  /** Sonuç başı maliyet. */
  costPerResult?: number;
  /** Getiri: sonuç değeri / harcama. */
  returnOnSpend?: number;
  /** Sonuç oranı: sonuç / tıklama. */
  resultRate?: number;
  /** İlk 3 sn oranı: 3 sn izlenme / gösterim. */
  threeSecondRate?: number;
  /** Tutma oranı: tam izlenme (thruplay) / 3 sn izlenme. */
  holdRate?: number;
}

const sumOptional = (rows: readonly AdDailyMetric[], pick: (row: AdDailyMetric) => number | undefined): number | undefined => {
  let total: number | undefined;
  for (const row of rows) {
    const value = pick(row);
    if (value !== undefined && Number.isFinite(value)) total = (total ?? 0) + value;
  }
  return total;
};

/** Günlük satırları toplar (toplamı topla, sonra böl). Boş liste → harcama 0, gösterim 0, geri kalan `undefined`. */
export function sumAdMetrics(rows: readonly AdDailyMetric[]): AdMetricSums {
  return {
    spend: rows.reduce((total, row) => total + row.spend, 0),
    impressions: rows.reduce((total, row) => total + row.impressions, 0),
    clicks: sumOptional(rows, (row) => row.clicks),
    results: sumOptional(rows, (row) => row.results),
    resultValue: sumOptional(rows, (row) => row.resultValue),
    video3sViews: sumOptional(rows, (row) => row.video3sViews),
    videoThruplays: sumOptional(rows, (row) => row.videoThruplays),
    days: new Set(rows.map((row) => row.date)).size,
  };
}

const ratio = (numerator: number | undefined, denominator: number | undefined): number | undefined =>
  numerator === undefined || denominator === undefined || denominator <= 0 ? undefined : numerator / denominator;

/** Oranları hesaplar. Payda 0 ya da ölçülmemiş → `undefined`; sonuç yokken (ölçülmemiş) sonuç maliyeti 0 değil `undefined`. */
export function computeAdMetrics(sums: AdMetricSums): AdMetrics {
  const perThousand = ratio(sums.spend, sums.impressions);
  return {
    clickRate: ratio(sums.clicks, sums.impressions),
    costPerClick: ratio(sums.spend, sums.clicks),
    costPerThousand: perThousand === undefined ? undefined : perThousand * 1000,
    costPerResult: ratio(sums.spend, sums.results),
    returnOnSpend: ratio(sums.resultValue, sums.spend),
    resultRate: ratio(sums.results, sums.clicks),
    threeSecondRate: ratio(sums.video3sViews, sums.impressions),
    holdRate: ratio(sums.videoThruplays, sums.video3sViews),
  };
}

// -------------------------------------------------------------- Karar ve rapor

export interface AdVerdict {
  status: AdVerdictStatus;
  /** Karar sebepleri (düz dil sözlüğünden; sayı gömülmez). */
  reasons: string[];
  confidence: ConfidenceLevel;
  /** Ölçülemeyen girdiler (hangi ölçü neden eksik); yoksa alan yok. */
  unmeasured?: string[];
}

/** Hesabın dönem içi alışılmışı (harcama ağırlıklı); ölçülemeyen `undefined`. */
export interface AdBaseline {
  costPerResult?: number;
  returnOnSpend?: number;
}

/** Bir reklamın dönem sonucu. `vsBaseline` alışılmışın kaç katı (maliyet < 1 iyi, getiri > 1 iyi). */
export interface AdResult {
  ad: Ad;
  creative?: AdCreative;
  campaignName?: string;
  sums: AdMetricSums;
  metrics: AdMetrics;
  vsBaseline: { costPerResult?: number; returnOnSpend?: number };
  verdict: AdVerdict;
}

export interface AdReport {
  period: { from: string; to: string; days: number };
  account: AdAccount;
  totals: { sums: AdMetricSums; metrics: AdMetrics };
  baseline?: AdBaseline;
  ads: AdResult[];
  /** Kreatifi kendi bir içeriğine bağlı olmayan reklam sayısı. */
  unlinkedCount: number;
}

// ------------------------------------------------------------ Matris tarafı

/**
 * Reklam işareti. Sıra = ÖNCELİK: `worked` en az bir kreatif tuttu · `fatigued` tutan yok, yorulan var · `weak` yargılananların hepsi
 * tutmadı · `unmeasured` kreatif var, yargılanan yok · `untested` reklam hesabı var, hücrede kreatif yok. Matris tarafı R4'tür.
 */
export const AD_SIGNALS = ["worked", "fatigued", "weak", "unmeasured", "untested"] as const;
export type AdSignal = (typeof AD_SIGNALS)[number];

/** Bir içeriğin reklamdaki durumu (`listAdUsage`). Kayıt yalnız içerik en az bir kreatife bağlıysa vardır ("denenmedi" yokluktan okunur). */
export interface AdUsage {
  contentItemId: string;
  creativeCount: number;
  signal: Exclude<AdSignal, "untested">;
  confidence: ConfidenceLevel;
  /** `ad:<adId>` başvuruları. */
  adRefs: string[];
}

// ------------------------------------------------------------------- Ayrıntı

/** Tek reklamın ayrıntısı (`getAdDetail`): sonuç + günlük seri (dönem içi, tarih sırasıyla). */
export interface AdDetail {
  account: AdAccount;
  period: { from: string; to: string; days: number };
  result: AdResult;
  campaignName?: string;
  adSetName?: string;
  /** Hesabın alışılmışı (aynı dönem); ölçülemeyen `undefined`. */
  baseline?: AdBaseline;
  series: AdDailyMetric[];
}

export * from "@/lib/domain/ad-matrix";
