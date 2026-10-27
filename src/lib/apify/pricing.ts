/**
 * Aktör fiyatı okuma + koşu maliyeti tahmini. Port kaynağı: `rakip analiz\src\kaynaklar\apify.ts` `birimFiyatOku`
 * ve `mcp\reels.ts` `maliyetTahmini`.
 *
 * Kural: bilinmeyen ≠ sıfır. Fiyat okunamazsa `priceUnknown: true` döner ve rezerve edilecek tutar MUHAFAZAKÂR bir
 * sabit birim fiyattan (`FALLBACK_UNIT_PRICE_USD`) hesaplanır — kaynaktaki gibi "0 rezerve, korumasız" DEĞİL: tavan
 * her zaman bir tutara karşı çalışır; gerçek tutar mutabakatta (`budget.ts` `reconcileRun`) düzelir.
 */
import "server-only";
import { ApifyConfigError, getActor } from "@/lib/apify/client";
import { roundUsd } from "@/lib/apify/usd";
import { listPlatformModules } from "@/lib/platforms/registry";

/** `PAY_PER_EVENT` fiyat olayı (Apify `pricingPerEvent.actorChargeEvents` değeri). */
export interface ApifyChargeEvent {
  eventPriceUsd?: number;
  eventTieredPricingUsd?: Record<string, { tieredEventPriceUsd?: number }>;
  /** Aktörün "asıl" ücret olayı — sonuç başına ücret. Opsiyonel olaylardan ayırır. */
  isPrimaryEvent?: boolean;
}

export interface ApifyPricingInfo {
  pricingModel?: string;
  pricePerUnitUsd?: number;
  pricingPerEvent?: {
    actorChargeEvents?: Record<string, ApifyChargeEvent>;
  };
}

/**
 * Fiyatı okunamayan aktör için sonuç başına GENEL varsayılan (USD): hiçbir platform modülünün sahiplenmediği aktörde kullanılır.
 * Platformun kendi aktörleri için yedek fiyat modüldedir (`PublicDataAdapter.pricing`; bilinen fiyatın yaklaşık 2 katı):
 * fazla tutmak eksik tutmaktan güvenlidir.
 */
export const FALLBACK_UNIT_PRICE_USD = 0.005;

/** Aktörün yedek birim fiyatı: sahibi olan platform modülününki, yoksa genel varsayılan. */
export function fallbackUnitPriceOf(actorId: string): number {
  const owner = listPlatformModules().find((module) => module.publicData.pricing.actorIds.includes(actorId));
  return owner?.publicData.pricing.fallbackUnitPriceUsd ?? FALLBACK_UNIT_PRICE_USD;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Bir olayın fiyatı; kademeli tarifede EN YÜKSEK kademe (tahmin yukarı yuvarlanır). */
function eventPrice(event: ApifyChargeEvent): number | undefined {
  if (!isRecord(event)) return undefined;
  const prices: number[] = [];
  if (typeof event.eventPriceUsd === "number") prices.push(event.eventPriceUsd);
  const tiers = isRecord(event.eventTieredPricingUsd) ? Object.values(event.eventTieredPricingUsd) : [];
  for (const tier of tiers) {
    if (isRecord(tier) && typeof tier.tieredEventPriceUsd === "number") prices.push(tier.tieredEventPriceUsd);
  }
  return prices.length ? Math.max(...prices) : undefined;
}

/**
 * Aktörün sonuç başına birim fiyatı.
 *
 * `PAY_PER_EVENT` aktörlerde `pricePerUnitUsd` YOKTUR — fiyat olay bazlı ve kademelidir. Aktörün çok sayıda ücret
 * olayı olabilir ve çoğu opsiyoneldir (TikTok'ta dakika başı transkripsiyon, YouTube'da AI özeti); bunları biz
 * tetiklemiyoruz, hepsinin maksimumu tahmini onlarca kat şişirir ve tavanı boş yere tetikler. Bu yüzden önce
 * `isPrimaryEvent` (sonuç başına ücret) aranır; yoksa en ucuz olaya düşülür. Kademeli tarifede o olayın EN YÜKSEK
 * kademesi alınır. Hiçbir fiyat okunamazsa `undefined`.
 */
export function readUnitPrice(pricing: ApifyPricingInfo): number | undefined {
  if (!isRecord(pricing)) return undefined;
  if (typeof pricing.pricePerUnitUsd === "number") return pricing.pricePerUnitUsd;
  const perEvent: unknown = pricing.pricingPerEvent;
  const rawEvents: unknown = isRecord(perEvent) ? perEvent.actorChargeEvents : undefined;
  // Ham API verisi: değerler ApifyChargeEvent değilse `eventPrice`/`find` içinde savunmalı okunur.
  const events = (isRecord(rawEvents) ? Object.values(rawEvents) : []) as ApifyChargeEvent[];
  if (!events.length) return undefined;

  const primary = events.find((event) => isRecord(event) && event.isPrimaryEvent);
  if (primary) {
    const price = eventPrice(primary);
    if (price !== undefined) return price;
  }
  const all = events.map(eventPrice).filter((price): price is number => price !== undefined);
  return all.length ? Math.min(...all) : undefined;
}

export interface CostEstimate {
  /** Rezerve edilecek tutar (USD, 6 ondalık). Fiyat bilinmiyorsa muhafazakâr varsayımdan hesaplanır. */
  amountUsd: number;
  /** Okunan birim fiyat; okunamadıysa `undefined`. */
  unitPriceUsd?: number;
  priceUnknown: boolean;
}

/**
 * Beklenen sonuç sayısı × birim fiyat. Sonuç sayısı ≥ 1 sonlu sayı olmalıdır (yukarı yuvarlanır). Fiyat bilinmiyorsa
 * `fallbackUnitPriceUsd` (verilmezse genel varsayılan) kullanılır.
 */
export function estimateCost(expectedResults: number, unitPriceUsd?: number, fallbackUnitPriceUsd: number = FALLBACK_UNIT_PRICE_USD): CostEstimate {
  if (!Number.isFinite(expectedResults) || expectedResults < 1) {
    throw new RangeError("Beklenen sonuç sayısı en az 1 olmalı.");
  }
  const results = Math.ceil(expectedResults);
  const known = typeof unitPriceUsd === "number" && Number.isFinite(unitPriceUsd) && unitPriceUsd >= 0;
  const unit = known ? unitPriceUsd : fallbackUnitPriceUsd;
  return {
    amountUsd: roundUsd(unit * results),
    unitPriceUsd: known ? unitPriceUsd : undefined,
    priceUnknown: !known,
  };
}

export interface ActorPricing {
  actorId: string;
  /** Aktör API'de bulundu ve fiyat kaydı okunabildi mi (ağ/HTTP hatasında `false`). */
  found: boolean;
  pricingModel?: string;
  unitPriceUsd?: number;
  /** Fiyat neden okunamadı (kullanıcıya/günlüğe). */
  reason?: string;
}

const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const pricingCache = new Map<string, { at: number; value: ActorPricing }>();

export function clearActorPricingCache(): void {
  pricingCache.clear();
}

/**
 * Aktörün güncel fiyatını Apify'dan okur (koşu BAŞLATMAZ, para harcamaz). Başarıyla okunan fiyat 6 saat önbelleğe
 * alınır. Ağ/HTTP hatası fırlatmaz — `unitPriceUsd: undefined` + `reason` döner (çağıran `estimateCost` ile
 * muhafazakâr tahmine düşer); yalnız `APIFY_TOKEN` yokluğu yükselir (yapılandırma hatası).
 */
export async function getActorPricing(actorId: string, now: number = Date.now()): Promise<ActorPricing> {
  const cached = pricingCache.get(actorId);
  if (cached && now - cached.at < PRICING_TTL_MS) return cached.value;

  let value: ActorPricing;
  try {
    const actor = await getActor(actorId);
    const latest = actor.pricingInfos.at(-1);
    if (!isRecord(latest)) {
      value = { actorId, found: true, reason: "pricingInfos boş — fiyat okunamadı" };
    } else {
      const info = latest as ApifyPricingInfo;
      const unitPriceUsd = readUnitPrice(info);
      value = {
        actorId,
        found: true,
        pricingModel: typeof info.pricingModel === "string" ? info.pricingModel : undefined,
        unitPriceUsd,
        reason: unitPriceUsd === undefined ? "fiyat alanı bu modelde okunamadı" : undefined,
      };
    }
  } catch (error) {
    if (error instanceof ApifyConfigError) throw error;
    return {
      actorId,
      found: false,
      reason: error instanceof Error ? error.message : "aktör fiyatı okunamadı",
    };
  }

  if (value.unitPriceUsd !== undefined) pricingCache.set(actorId, { at: now, value });
  return value;
}

/** Aktör fiyatını okuyup `expectedResults` için tahmini döndürür (`getActorPricing` + `estimateCost`). */
export async function estimateActorCost(
  actorId: string,
  expectedResults: number,
): Promise<CostEstimate & { pricing: ActorPricing }> {
  const pricing = await getActorPricing(actorId);
  return { ...estimateCost(expectedResults, pricing.unitPriceUsd, fallbackUnitPriceOf(actorId)), pricing };
}
