/**
 * Reklam veri sağlayıcısı sözleşmesi (`docs/REKLAM-MODUL-PLAN.md` §7). YALNIZ OKUMA: üç metot da hesabı, yapıyı ya da ölçüyü okur;
 * bütçe, durum, oluşturma ya da boost yazan metot YOKTUR ve eklenmez (`no-write.test.ts` bu dizindeki kaynakları tarar). Uygulamalar
 * `lib/ads/providers/<sağlayıcı>/**` altında durur (R2: Zernio) ve `src/app` / `src/components` onları içe aktarmaz (sınır grep'i).
 *
 * Dönüş tipleri domain'dendir (`domain/ads.ts`); panelin iç kimlikleri (`id`, `accountId`…) sağlayıcıda YOKTUR, bu yüzden her kayıt
 * sağlayıcıdaki kimlikle (`externalId`) ve üstünün kimliğiyle gelir. Eşlemeyi ve yazmayı çağıran (senkron işi, service role) yapar.
 * Ölçülemeyen alan `undefined`'dır (0 değil). Para birimi hesabındır; sağlayıcı dönüşüm yapmaz.
 */
import type { AdAccount, AdCampaign, AdCreative, AdDailyMetric, Ad, AdSet } from "@/lib/domain/ads";

/** Sağlayıcıdan okunan hesap (hedef panelde girilir, sağlayıcıda yoktur). */
export type ProviderAdAccount = Pick<AdAccount, "externalAccountId" | "providerAccountId" | "label" | "currency" | "status">;

export interface ProviderCampaign extends Omit<AdCampaign, "id" | "accountId"> {
  /** Üst hesabın sağlayıcıdaki kimliği. */
  accountExternalId: string;
}

export interface ProviderAdSet extends Omit<AdSet, "id" | "campaignId"> {
  campaignExternalId: string;
}

export interface ProviderCreative extends Omit<AdCreative, "id" | "sourceContentId"> {
  /** Sağlayıcıdaki kimlik (kreatifi reklama bağlar); yoksa kreatif yalnız reklamın altında anlatılır. */
  externalId: string;
}

export interface ProviderAd extends Omit<Ad, "id" | "adSetId" | "creativeId"> {
  adSetExternalId: string;
  creativeExternalId?: string;
}

/** Bir hesabın yapısı (kampanya → set → reklam; kreatifler). */
export interface ProviderStructure {
  campaigns: ProviderCampaign[];
  adSets: ProviderAdSet[];
  ads: ProviderAd[];
  creatives: ProviderCreative[];
  /** Okunup alınamayan öğe sayısı (kimliği olmayan reklam, bozuk öğe). Sessiz düşmez: eşitleme "kısmen" biter. */
  dropped: number;
}

/** Günlük ölçüler + alınamayan satır sayısı (bozuk satır, reklam/gün/harcama alanı eksik). */
export interface ProviderMetrics {
  metrics: ProviderDailyMetric[];
  dropped: number;
}

/** Bir reklamın bir günlük ölçüsü; reklam sağlayıcıdaki kimlikle anılır. */
export type ProviderDailyMetric = Omit<AdDailyMetric, "adId"> & { adExternalId: string };

export interface DailyMetricsQuery {
  /** YYYY-AA-GG, dahil. */
  from: string;
  /** YYYY-AA-GG, dahil. */
  to: string;
}

/**
 * Sağlayıcı hata kodları. `plan_required`: sağlayıcının planı reklam verisini içermiyor (kullanıcıya söylenir, yeniden denenmez).
 * `currency_mismatch`: okunan para birimi kayıtlı hesabınkinden farklı; yanlış birimle tutar yazılmasın diye o hesap atlanır.
 */
export const ADS_PROVIDER_ERROR_CODES = ["auth", "not_found", "rate_limited", "unavailable", "plan_required", "currency_mismatch"] as const;
export type AdsProviderErrorCode = (typeof ADS_PROVIDER_ERROR_CODES)[number];

export class AdsProviderError extends Error {
  constructor(
    readonly code: AdsProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdsProviderError";
  }
}

/** Yalnız okuma. Metotlar hata durumunda `AdsProviderError` fırlatır (ham sağlayıcı hatası sızmaz). */
export interface AdsProvider {
  /** Bağlı reklam hesapları. */
  listAccounts(): Promise<ProviderAdAccount[]>;
  /** Bir hesabın kampanya / set / reklam / kreatif yapısı. */
  listStructure(externalAccountId: string): Promise<ProviderStructure>;
  /** Bir hesabın günlük reklam ölçüleri (aralık dahil). */
  dailyMetrics(externalAccountId: string, query: DailyMetricsQuery): Promise<ProviderMetrics>;
}
