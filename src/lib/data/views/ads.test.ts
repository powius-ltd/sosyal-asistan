import { describe, expect, it } from "vitest";

import { adPeriodOf, buildAdDetail, buildAdReport, buildAdUsage, shiftDay, sortAdAccounts, type AdDataset } from "@/lib/data/views/ads";
import type { AdAccount, AdDailyMetric } from "@/lib/domain/ads";

const account: AdAccount = { id: "a1", workspaceId: "w", provider: "zernio", externalAccountId: "act_1", currency: "TRY", status: "active" };
const dataset = (metrics: AdDailyMetric[]): AdDataset => ({
  accounts: [account],
  campaigns: [{ id: "c1", accountId: "a1", externalId: "x", name: "Kampanya", status: "active" }],
  adSets: [{ id: "s1", campaignId: "c1", externalId: "x", name: "Set", status: "active" }],
  ads: [
    { id: "d1", adSetId: "s1", externalId: "x", name: "Bir", status: "active", creativeId: "k1" },
    { id: "d2", adSetId: "s1", externalId: "y", name: "İki", status: "active" },
  ],
  creatives: [{ id: "k1", format: "video", sourceContentId: "i1" }],
  metrics,
});
const row = (adId: string, date: string, spend: number, extra: Partial<AdDailyMetric> = {}): AdDailyMetric => ({ adId, date, spend, impressions: 1000, ...extra });
const now = new Date("2026-10-20T09:00:00Z");

describe("reklam dönemi", () => {
  it("days kapanmış gün + bugün", () => {
    expect(adPeriodOf(now, 7)).toEqual({ from: "2026-10-13", to: "2026-10-20", days: 7 });
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildAdReport", () => {
  const period = adPeriodOf(now, 7);
  it("dönem dışı satırı saymaz, ölçülemeyeni undefined bırakır, karar undecided", () => {
    const report = buildAdReport(dataset([row("d1", "2026-10-19", 100, { results: 2, resultValue: 400 }), row("d1", "2026-09-01", 999), row("d2", "2026-10-18", 50)]), account, period);
    expect(report.totals.sums.spend).toBe(150);
    expect(report.ads.map((r) => r.ad.id)).toEqual(["d1", "d2"]);
    expect(report.ads[0]?.metrics.costPerResult).toBe(50);
    expect(report.ads[1]?.metrics.costPerResult).toBeUndefined();
    expect(report.ads[1]?.vsBaseline.costPerResult).toBeUndefined();
    expect(report.ads.every((r) => r.verdict.status === "undecided")).toBe(true);
    expect(report.unlinkedCount).toBe(1);
  });
  it("hiç satır yokken harcama 0, oranlar undefined", () => {
    const report = buildAdReport(dataset([]), account, period);
    expect(report.totals.sums.spend).toBe(0);
    expect(report.totals.metrics.costPerResult).toBeUndefined();
    expect(report.baseline).toBeUndefined();
  });
});

describe("buildAdReport — karar", () => {
  const goalAccount: AdAccount = { ...account, goal: { kind: "value", resultLabel: "satın alma", targetReturn: 3, grossMargin: 0.5 } };
  const days = Array.from({ length: 28 }, (_, i) => shiftDay("2026-09-23", i));
  const good = (adId: string, extra: Partial<AdDailyMetric> = {}) => days.map((date) => row(adId, date, 100, { clicks: 20, results: 5, resultValue: 450, frequency: 1.5, ...extra }));
  const period28 = adPeriodOf(now, 28);

  it("hedefsiz hesapta karar undecided + goal_missing; hedefli hesapta gerekçeli", () => {
    const data = dataset([...good("d1"), ...good("d2", { resultValue: 100 })]);
    const plain = buildAdReport(data, account, period28);
    expect(plain.ads.map((r) => [r.verdict.status, r.verdict.reasons])).toEqual([["undecided", ["goal_missing"]], ["undecided", ["goal_missing"]]]);
    const judged = buildAdReport({ ...data, accounts: [goalAccount] }, goalAccount, period28);
    const byId = new Map(judged.ads.map((r) => [r.ad.id, r.verdict]));
    expect(byId.get("d1")).toMatchObject({ status: "scale", reasons: ["scale_above_target"] });
    expect(byId.get("d2")).toMatchObject({ status: "stop", reasons: ["stop_below_break_even"] });
  });
  it("aynı veri aynı kararı verir; hesap rules'ı eşiği ezer", () => {
    const data = { ...dataset([...good("d1"), ...good("d2")]), accounts: [goalAccount] };
    expect(buildAdReport(data, goalAccount, period28)).toEqual(buildAdReport(data, goalAccount, period28));
    const strict = buildAdReport(data, goalAccount, period28, { scaleAboveTargetMultiple: 2 });
    expect(strict.ads[0]?.verdict.status).toBe("hold");
  });
  it("alışılmışa göre kat: iki harcamalı reklamla kurulur, tek reklamda undefined", () => {
    const both = buildAdReport(dataset([...good("d1"), ...good("d2", { results: 10 })]), account, period28);
    expect(both.baseline?.costPerResult).toBeCloseTo(200 / 15, 5);
    expect(both.ads.find((r) => r.ad.id === "d2")?.vsBaseline.costPerResult).toBeLessThan(1);
    const solo = buildAdReport(dataset(good("d1")), account, period28);
    expect(solo.baseline).toBeUndefined();
    expect(solo.ads[0]?.vsBaseline.costPerResult).toBeUndefined();
  });
});

describe("buildAdReport — açık gün (bugün) karara girmez", () => {
  const goalAccount: AdAccount = { ...account, goal: { kind: "value", resultLabel: "satın alma", targetReturn: 3, grossMargin: 0.5 } };
  const period28c = adPeriodOf(now, 28);
  const closed = (adId: string) =>
    Array.from({ length: 28 }, (_, i) => row(adId, shiftDay("2026-09-22", i), 100, { clicks: 20, results: 5, resultValue: 450, frequency: 1.5 }));
  // Dönüşümler geç sayılır: bugünün yarım satırında harcama var, sonuç henüz yok.
  const badToday = row("d1", "2026-10-20", 400, { clicks: 5, results: 0, resultValue: 0, frequency: 5 });
  const data = (extra: AdDailyMetric[]) => ({ ...dataset([...closed("d1"), ...closed("d2"), ...extra]), accounts: [goalAccount] });

  it("bugünün kötü satırı kararı, ölçüleri ve alışılmışı değiştirmez", () => {
    const without = buildAdReport(data([]), goalAccount, period28c);
    const withToday = buildAdReport(data([badToday]), goalAccount, period28c);
    expect(without.ads[0]?.verdict).toMatchObject({ status: "scale" });
    expect(withToday).toEqual(without);
    expect(withToday.ads.find((r) => r.ad.id === "d1")?.sums.spend).toBe(2800);
  });
  it("ani kötüleşme ve yorgunluk bugüne bakmaz; ham satır yalnız ayrıntı serisinde görünür", () => {
    const verdict = buildAdReport(data([badToday]), goalAccount, period28c).ads.find((r) => r.ad.id === "d1")?.verdict;
    expect(verdict?.reasons).not.toContain("recent_worsening");
    expect(verdict?.status).not.toBe("fatigued");
    expect(verdict?.unmeasured ?? []).not.toContain("worsening:few_days");
    expect(buildAdDetail(data([badToday]), "d1", period28c)?.series.at(-1)).toMatchObject({ date: "2026-10-20", spend: 400 });
  });
  it("28 günlük varsayılan dönem 28 kapanmış gün okur: ani kötüleşme ölçülür", () => {
    const verdict = buildAdReport(data([badToday]), goalAccount, adPeriodOf(now, 28)).ads.find((r) => r.ad.id === "d1")?.verdict;
    expect(verdict?.unmeasured ?? []).not.toContain("worsening:few_days");
  });
});

describe("buildAdDetail / buildAdUsage", () => {
  const period = adPeriodOf(now, 7);
  it("günlük seriyi tarih sırasıyla verir; bilinmeyen reklam undefined", () => {
    const data = dataset([row("d1", "2026-10-20", 10), row("d1", "2026-10-18", 5)]);
    expect(buildAdDetail(data, "d1", period)?.series.map((s) => s.date)).toEqual(["2026-10-18", "2026-10-20"]);
    expect(buildAdDetail(data, "yok", period)).toBeUndefined();
  });
  it("kullanım yalnız bağlı içerik için satır yazar", () => {
    const usage = buildAdUsage(dataset([]), ["i1", "i2"]);
    expect(usage).toEqual([{ contentItemId: "i1", creativeCount: 1, signal: "unmeasured", confidence: "low", adRefs: ["ad:d1"] }]);
  });
  it("hesapları ad sonra kimlikle dizer", () => {
    expect(sortAdAccounts([{ ...account, id: "b", label: "B" }, { ...account, id: "a", label: "A" }]).map((a) => a.id)).toEqual(["a", "b"]);
  });
});
