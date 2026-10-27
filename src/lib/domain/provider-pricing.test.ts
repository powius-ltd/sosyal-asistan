import { describe, expect, it } from "vitest";

import { apiPriceUsd, PRICED_MODELS, PROVIDER_PRICE_VERSION, resolvePricedModel, shadowApiCost, SUBSCRIPTION_SHADOW_MODEL, type ShadowRunInput } from "@/lib/domain/provider-pricing";

const at = (iso: string) => new Date(iso);

describe("resolvePricedModel", () => {
  it("agy ve Claude CLI'nin bildirdiği adları tablo anahtarına çevirir", () => {
    expect(resolvePricedModel("gemini-3.8-flash-medium")).toBe("gemini-3-8-flash");
    expect(resolvePricedModel("gemini-3.8-flash")).toBe("gemini-3-8-flash");
    expect(resolvePricedModel("claude-opus-5-5[1m]")).toBe("claude-opus-5-5");
    expect(resolvePricedModel("Sonnet")).toBe("claude-sonnet-5-5");
    expect(resolvePricedModel("claude-haiku-5-5")).toBe("claude-haiku-5-5");
  });

  it("tanınmayan ya da boş ad → undefined (fiyat uydurulmaz)", () => {
    expect(resolvePricedModel(undefined)).toBeUndefined();
    expect(resolvePricedModel("  ")).toBeUndefined();
    expect(resolvePricedModel("gpt-5")).toBeUndefined();
    expect(resolvePricedModel("claude-sonnet-4-5")).toBeUndefined();
    // Türevler ana model sayılmaz (başka fiyat): yalnız tam ad ya da fiyatı değiştirmeyen sonek eşleşir.
    for (const name of ["gemini-3.8-flash-lite", "gemini-3.8-flash-8b", "gemini-3.8-flash-lite-medium", "claude-sonnet-5-5-mini", "claude-haiku-5-55", "sonnet-lite"]) {
      expect(resolvePricedModel(name), name).toBeUndefined();
    }
    expect(resolvePricedModel("gemini-3.8-flash-high")).toBe("gemini-3-8-flash");
    expect(resolvePricedModel("claude-sonnet-5-5-20261001")).toBe("claude-sonnet-5-5");
  });

  it("abonelik varsayım modellerinin hepsi tabloda var", () => {
    for (const model of Object.values(SUBSCRIPTION_SHADOW_MODEL)) expect(PRICED_MODELS).toContain(model);
  });
});

describe("apiPriceUsd", () => {
  const mtok = (model: string, input: number, output: number, when = "2026-10-12") => apiPriceUsd({ model, inputTokens: input, outputTokens: output, at: at(when) });

  it("plan §2 fiyatları: MTok başına giriş / çıkış", () => {
    expect(mtok("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBeCloseTo(12, 9);
    expect(mtok("claude-haiku-5-5", 100_000, 1_000_000)).toBeCloseTo(0.51, 9);
    expect(mtok("claude-opus-5-5", 1_000_000, 1_000_000)).toBeCloseTo(24, 9);
    expect(mtok("gemini-3.8-flash", 1_000_000, 1_000_000)).toBeCloseTo(4.5, 9);
  });

  it("GERÇEK agy zarfı (30.508 giriş / 23.280 çıkış, düşünme dahil) Gemini ile ≈ $0,11 tutar", () => {
    expect(mtok("gemini-3.8-flash-medium", 30_508, 23_280)).toBeCloseTo(0.110_2, 3);
  });

  it("ölçülen Claude çağrısı (plan §2: fikir + script 20.720 / 18.540) Sonnet ile ≈ $0,23", () => {
    expect(mtok("claude-sonnet-5-5", 20_720, 18_540)).toBeCloseTo(0.226_84, 4);
  });

  it("Gemini fiyatı 1.1.2027'de iki katına çıkar; 31.12.2026 hâlâ eski fiyat", () => {
    const before = mtok("gemini-3.8-flash", 1_000_000, 1_000_000, "2026-12-31T23:59:59Z") as number;
    const after = mtok("gemini-3.8-flash", 1_000_000, 1_000_000, "2027-01-01T00:00:00Z") as number;
    expect(before).toBeCloseTo(4.5, 9);
    expect(after).toBeCloseTo(9, 9);
  });

  it("token eksik / geçersiz, model tanınmıyor ya da tarih geçersiz → undefined (0 değil)", () => {
    expect(apiPriceUsd({ model: "claude-sonnet-5-5", inputTokens: undefined, outputTokens: 10, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: undefined, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: "claude-sonnet-5-5", inputTokens: -1, outputTokens: 10, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: "claude-sonnet-5-5", inputTokens: Number.NaN, outputTokens: 10, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: "bilinmeyen", inputTokens: 10, outputTokens: 10, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: undefined, inputTokens: 10, outputTokens: 10, at: at("2026-10-12") })).toBeUndefined();
    expect(apiPriceUsd({ model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: 10, at: at("geçersiz") })).toBeUndefined();
  });

  it("Haiku fiyatı yalnız ≤ 100 bin token'lık giriş içindir: üstü tabloda yok (undefined, düşük fiyatla eksik sayılmaz)", () => {
    expect(mtok("claude-haiku-5-5", 100_000, 1_000)).toBeCloseTo(0.0105, 9);
    expect(mtok("claude-haiku-5-5", 100_001, 1_000)).toBeUndefined();
    expect(mtok("haiku", 250_000, 0)).toBeUndefined();
    // Sınır yalnız Haiku'dadır.
    expect(mtok("claude-sonnet-5-5", 250_000, 0)).toBeCloseTo(0.5, 9);
  });

  it("token'ı sıfır olan çağrının fiyatı 0'dır (bilinen sıfır)", () => {
    expect(mtok("claude-sonnet-5-5", 0, 0)).toBe(0);
  });
});

describe("shadowApiCost", () => {
  const run = (patch: Partial<ShadowRunInput>): ShadowRunInput => ({ provider: "claude_cli", billing: "subscription", startedAt: "2026-10-12T10:00:00.000Z", ...patch });

  it("abonelik koşularının fiyatlanabilenlerini toplar; token'ı olmayanı ayrı sayar", () => {
    const shadow = shadowApiCost([
      run({ provider: "gemini", inputTokens: 30_508, outputTokens: 23_280 }),
      run({ provider: "claude_cli", inputTokens: 20_720, outputTokens: 18_540 }),
      run({ provider: "gemini" }),
      run({ provider: "claude_cli", inputTokens: 5 }),
    ]);
    expect(shadow.pricedRuns).toBe(2);
    expect([shadow.unpricedRuns, shadow.unlistedRuns], "ikisi de token'sız: modeli tabloda olmayan yok").toEqual([2, 0]);
    expect(shadow.usd).toBeCloseTo(0.1102 + 0.22684, 3);
    expect(shadow.priceVersion).toBe(PROVIDER_PRICE_VERSION);
  });

  it("koşunun modeli kayıtlıysa O kullanılır (varsayım değil); tabloda olmayan kayıtlı model fiyatlanmaz", () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    // Claude CLI varsayımı Sonnet ($2 + $10 = 12); kayıtlı Haiku ($0,10 + $0,50 = 0,6) ve Opus ($4 + $20 = 24) kendi fiyatıyla okunur.
    expect(shadowApiCost([run(tokens)]).usd).toBeCloseTo(12, 9);
    expect(shadowApiCost([run({ inputTokens: 100_000, outputTokens: 100_000, model: "claude-haiku-5-5" })]).usd).toBeCloseTo(0.06, 9);
    expect(shadowApiCost([run({ ...tokens, model: "claude-opus-5-5[1m]" })]).usd).toBeCloseTo(24, 9);
    expect(shadowApiCost([run({ ...tokens, provider: "gemini", model: "gemini-3.8-flash-medium" })]).usd).toBeCloseTo(4.5, 9);
    expect(shadowApiCost([run({ ...tokens, model: "bilinmeyen-model" })])).toMatchObject({ pricedRuns: 0, unpricedRuns: 1, unlistedRuns: 1 });
    // Türev model ve Haiku'nun tablo dışı kullanımı "modeli tabloda yok" sayılır; token'sız koşu ayrı sayılır.
    expect(
      shadowApiCost([run({ ...tokens, provider: "gemini", model: "gemini-3.8-flash-lite" }), run({ ...tokens, model: "claude-haiku-5-5" }), run({ model: "claude-haiku-5-5" })]),
    ).toMatchObject({ pricedRuns: 0, unpricedRuns: 3, unlistedRuns: 2 });
    expect(shadowApiCost([run({ ...tokens, model: "bilinmeyen-model" })]).usd, "fiyat uydurulmaz").toBeUndefined();
  });

  it("hiçbir koşunun token'ı yoksa tutar undefined (0 değil)", () => {
    const shadow = shadowApiCost([run({}), run({ provider: "gemini" })]);
    expect(shadow).toEqual({ pricedRuns: 0, unpricedRuns: 2, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION });
    expect(shadow.usd).toBeUndefined();
  });

  it("abonelik dışı (metered) koşuları ve boş listeyi saymaz", () => {
    expect(shadowApiCost([run({ billing: "metered", provider: "anthropic", inputTokens: 1, outputTokens: 1 })])).toEqual({ pricedRuns: 0, unpricedRuns: 0, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION });
    expect(shadowApiCost([])).toEqual({ pricedRuns: 0, unpricedRuns: 0, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION });
  });

  it("model varsayımı olmayan abonelik sağlayıcısı fiyatlanamaz sayılır", () => {
    expect(shadowApiCost([run({ provider: "deepgram", inputTokens: 1, outputTokens: 1 })])).toMatchObject({ pricedRuns: 0, unpricedRuns: 1, unlistedRuns: 1 });
  });

  it("koşunun tarihine göre fiyat seçilir (2027 Gemini)", () => {
    const old = shadowApiCost([run({ provider: "gemini", inputTokens: 1_000_000, outputTokens: 0, startedAt: "2026-12-31T12:00:00Z" })]);
    const next = shadowApiCost([run({ provider: "gemini", inputTokens: 1_000_000, outputTokens: 0, startedAt: "2027-01-01T12:00:00Z" })]);
    expect([old.usd, next.usd]).toEqual([0.75, 1.5]);
  });
});
