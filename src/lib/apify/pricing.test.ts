import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActorPricingCache,
  estimateActorCost,
  estimateCost,
  FALLBACK_UNIT_PRICE_USD,
  getActorPricing,
  readUnitPrice,
} from "@/lib/apify/pricing";
import { jsonResponse } from "@/lib/apify/test-support";

describe("readUnitPrice (birimFiyatOku portu)", () => {
  it("1 · asıl (isPrimaryEvent) olay seçilir; pahalı opsiyonel olaylar (transkripsiyon) yok sayılır", () => {
    const price = readUnitPrice({
      pricingModel: "PAY_PER_EVENT",
      pricingPerEvent: {
        actorChargeEvents: {
          transcript: { eventPriceUsd: 0.048 },
          result: { eventPriceUsd: 0.0023, isPrimaryEvent: true },
          summary: { eventPriceUsd: 0.015 },
        },
      },
    });
    expect(price).toBe(0.0023);
  });

  it("2 · kademeli tarifede o olayın EN YÜKSEK kademesi alınır (tahmin yukarı yuvarlanır)", () => {
    const price = readUnitPrice({
      pricingPerEvent: {
        actorChargeEvents: {
          result: {
            isPrimaryEvent: true,
            eventTieredPricingUsd: {
              FREE: { tieredEventPriceUsd: 0.0027 },
              BRONZE: { tieredEventPriceUsd: 0.0025 },
              GOLD: { tieredEventPriceUsd: 0.0021 },
            },
          },
        },
      },
    });
    expect(price).toBe(0.0027);
  });

  it("3 · asıl olay yoksa en ucuz olaya düşer", () => {
    const price = readUnitPrice({
      pricingPerEvent: {
        actorChargeEvents: {
          a: { eventPriceUsd: 0.05 },
          b: { eventPriceUsd: 0.004 },
          c: { eventTieredPricingUsd: { X: { tieredEventPriceUsd: 0.02 }, Y: { tieredEventPriceUsd: 0.01 } } },
        },
      },
    });
    expect(price).toBe(0.004);
  });

  it("4 · okunamıyorsa undefined (bilinmeyen ≠ sıfır)", () => {
    expect(readUnitPrice({})).toBeUndefined();
    expect(readUnitPrice({ pricingModel: "PAY_PER_EVENT", pricingPerEvent: { actorChargeEvents: {} } })).toBeUndefined();
    expect(
      readUnitPrice({ pricingPerEvent: { actorChargeEvents: { a: { isPrimaryEvent: true }, b: {} } } }),
    ).toBeUndefined();
  });

  it("asıl olayın fiyatı okunamazsa diğer olayların en ucuzuna düşer", () => {
    const price = readUnitPrice({
      pricingPerEvent: { actorChargeEvents: { a: { isPrimaryEvent: true }, b: { eventPriceUsd: 0.03 }, c: { eventPriceUsd: 0.01 } } },
    });
    expect(price).toBe(0.01);
  });

  it("pricePerUnitUsd (PRICE_PER_UNIT modeli) doğrudan okunur; 0 geçerli bir fiyattır", () => {
    expect(readUnitPrice({ pricingModel: "PRICE_PER_UNIT", pricePerUnitUsd: 0.0012 })).toBe(0.0012);
    expect(readUnitPrice({ pricePerUnitUsd: 0 })).toBe(0);
  });

  it("bozuk şekilli ham veri fırlatmaz", () => {
    const broken = { pricingPerEvent: { actorChargeEvents: { a: null, b: "x", c: { eventTieredPricingUsd: "y" } } } };
    expect(() => readUnitPrice(broken as never)).not.toThrow();
    expect(readUnitPrice(broken as never)).toBeUndefined();
  });
});

describe("estimateCost", () => {
  it("bilinen fiyat: sonuç sayısı × birim fiyat, 6 ondalık", () => {
    expect(estimateCost(30, 0.0023)).toEqual({ amountUsd: 0.069, unitPriceUsd: 0.0023, priceUnknown: false });
    expect(estimateCost(3, 0.1).amountUsd).toBe(0.3);
  });

  it("fiyat okunamadı: priceUnknown + muhafazakâr tahmin (0 DEĞİL)", () => {
    const estimate = estimateCost(10);
    expect(estimate.priceUnknown).toBe(true);
    expect(estimate.unitPriceUsd).toBeUndefined();
    expect(estimate.amountUsd).toBe(10 * FALLBACK_UNIT_PRICE_USD);
    expect(estimate.amountUsd).toBeGreaterThan(0);
  });

  it("ücretsiz aktör (birim fiyat 0) bilinen fiyattır, priceUnknown değildir", () => {
    expect(estimateCost(5, 0)).toEqual({ amountUsd: 0, unitPriceUsd: 0, priceUnknown: false });
  });

  it("sonuç sayısı yukarı yuvarlanır; 1'den küçük/sonsuz/NaN reddedilir", () => {
    expect(estimateCost(2.2, 1).amountUsd).toBe(3);
    expect(() => estimateCost(0, 1)).toThrow(RangeError);
    expect(() => estimateCost(Number.NaN, 1)).toThrow(RangeError);
    expect(() => estimateCost(Number.POSITIVE_INFINITY, 1)).toThrow(RangeError);
  });
});

describe("getActorPricing / estimateActorCost", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("APIFY_TOKEN", "apify_api_test-token-not-real");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    clearActorPricingCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const actorBody = (pricingInfos: unknown[]) => ({ data: { id: "actor1", pricingInfos } });

  it("en son fiyat kaydını okur ve 6 saat önbelleğe alır", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(actorBody([{ pricingModel: "PRICE_PER_UNIT", pricePerUnitUsd: 9 }, { pricingModel: "PRICE_PER_UNIT", pricePerUnitUsd: 0.002 }])),
    );
    const first = await getActorPricing("apify/instagram-scraper", 0);
    const second = await getActorPricing("apify/instagram-scraper", 60_000);
    expect(first).toMatchObject({ found: true, unitPriceUsd: 0.002, pricingModel: "PRICE_PER_UNIT" });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getActorPricing("apify/instagram-scraper", 7 * 60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pricingInfos boşsa fiyat undefined + sebep; önbelleğe alınmaz", async () => {
    fetchMock.mockResolvedValue(jsonResponse(actorBody([])));
    const pricing = await getActorPricing("a/b");
    expect(pricing.found).toBe(true);
    expect(pricing.unitPriceUsd).toBeUndefined();
    expect(pricing.reason).toMatch(/pricingInfos boş/);
    await getActorPricing("a/b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP hatasında fırlatmaz: found=false; estimateActorCost muhafazakâr tahmine düşer", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 404));
    const estimate = await estimateActorCost("yok/aktor", 4);
    expect(estimate.pricing.found).toBe(false);
    expect(estimate).toMatchObject({ priceUnknown: true, amountUsd: 4 * FALLBACK_UNIT_PRICE_USD });
  });

  it("APIFY_TOKEN yokluğu yutulmaz (yapılandırma hatası)", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    await expect(getActorPricing("a/b")).rejects.toThrow(/APIFY_TOKEN tanımlı değil/);
  });
});
