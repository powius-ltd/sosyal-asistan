import { describe, expect, it } from "vitest";

import { subscriptionUsage } from "@/lib/data/views/subscription-usage";
import { PROVIDER_PRICE_VERSION } from "@/lib/domain/provider-pricing";

const STARTED = "2026-10-12T10:00:00.000Z";
const noShadow = { pricedRuns: 0, unpricedRuns: 0, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION };

describe("subscriptionUsage", () => {
  it("yalnız abonelik koşularını sağlayıcı başına sayar; ücretli koşular sayılmaz", () => {
    const usage = subscriptionUsage([
      { provider: "gemini", billing: "subscription", startedAt: STARTED },
      { provider: "gemini", billing: "subscription", startedAt: STARTED },
      { provider: "claude_cli", billing: "subscription", startedAt: STARTED },
      { provider: "apify", billing: "metered", startedAt: STARTED },
      { provider: "anthropic", billing: "metered", startedAt: STARTED },
    ]);
    expect(usage).toEqual({ runs: 3, byProvider: { gemini: 2, claude_cli: 1 }, shadow: { ...noShadow, unpricedRuns: 3 } });
  });

  it("abonelik koşusu yoksa 0 koşu ve boş sağlayıcı haritası (var olmayan sağlayıcı anahtarı yok)", () => {
    expect(subscriptionUsage([{ provider: "apify", billing: "metered", startedAt: STARTED }])).toEqual({ runs: 0, byProvider: {}, shadow: noShadow });
    expect(subscriptionUsage([])).toEqual({ runs: 0, byProvider: {}, shadow: noShadow });
  });

  it("gölge maliyet: token'ı kayıtlı abonelik koşuları fiyatlanır, token'ı olmayan 'fiyatlanamadı' sayılır", () => {
    const { shadow } = subscriptionUsage([
      { provider: "gemini", billing: "subscription", startedAt: STARTED, inputTokens: 30_508, outputTokens: 23_280 },
      { provider: "gemini", billing: "subscription", startedAt: STARTED },
      { provider: "apify", billing: "metered", startedAt: STARTED, inputTokens: 1, outputTokens: 1 },
    ]);
    expect([shadow.pricedRuns, shadow.unpricedRuns]).toEqual([1, 1]);
    expect(shadow.usd).toBeCloseTo(0.1102, 3);
  });
});
