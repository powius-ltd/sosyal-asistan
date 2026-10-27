/**
 * Sözleşme parçası: maliyet, koşular, ölçülemeyenler ve genel bakış.
 */
import { expect, it } from "vitest";

import { apiPriceUsd, PROVIDER_PRICE_VERSION, shadowModelOf } from "@/lib/domain/provider-pricing";
import { toDayKey } from "@/lib/format";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { DAY_KEY, expectCode, expectDescending, MISSING_ID, MONTH_KEY, ms, type ContractContext } from "@/lib/data/contract/support";

export function opsContract(ctx: ContractContext): void {
  const { wsId, create, allRuns } = ctx;

  it("maliyet ve koşular: greatest(actual, reserved) ay toplamı listRuns ile tutarlı; koşu filtreleri", async () => {
    const r = create();
    const ws = await r.getWorkspace(wsId);
    const cost = await r.getCostSummary(wsId);
    expect(cost.month).toMatch(MONTH_KEY);
    expect(cost.totalCommittedUsd).toBeCloseTo(cost.apify.committedUsd + cost.llm.committedUsd, 3);
    // Ayın koşuları sayfalanarak toplanır: tek sayfaya (200) sığar varsayımı yok.
    const runs = await allRuns(r);
    const inMonth = runs.filter((x) => toDayKey(x.startedAt, ws?.timezone)?.startsWith(cost.month));
    const metered = inMonth.filter((x) => x.billing === "metered");
    const apifyRuns = metered.filter((x) => x.provider === "apify");
    for (const [bucket, group] of [[cost.apify, apifyRuns], [cost.llm, metered.filter((x) => x.provider !== "apify")]] as const) {
      expect(bucket.runs).toBe(group.length);
      expect(bucket.committedUsd).toBeCloseTo(group.reduce((s, x) => s + Math.max(x.actualUsd ?? 0, x.reservedUsd), 0), 3);
      expect(bucket.committedUsd).toBeGreaterThanOrEqual(bucket.actualUsd);
      expect(bucket.unreconciledRuns).toBe(group.filter((x) => x.actualUsd === undefined).length);
      expect(bucket.priceUnknownRuns).toBe(group.filter((x) => x.priceUnknown).length);
    }
    // Abonelik koşuları (agy/Claude CLI) tutara ve mutabakat sayacına girmez: yalnız sağlayıcı başına sayılır; tutar yoktur (0 değil).
    const subscription = inMonth.filter((x) => x.billing === "subscription");
    expect(cost.subscription.runs).toBe(subscription.length);
    expect(Object.values(cost.subscription.byProvider).reduce((s, n) => s + (n ?? 0), 0)).toBe(subscription.length);
    for (const provider of new Set(subscription.map((x) => x.provider))) {
      expect(cost.subscription.byProvider[provider], provider).toBe(subscription.filter((x) => x.provider === provider).length);
    }
    for (const x of subscription) expect(x.actualUsd, `${x.id}: abonelikte tutar yok`).toBeUndefined();
    // "API'de tutardı" gölge maliyeti: token'ı kayıtlı koşular fiyatlanır, kalanı sayılır; hiçbiri fiyatlanamadıysa tutar yok (0 değil).
    const shadow = cost.subscription.shadow;
    // Fiyat: kayıtlı model (yoksa sağlayıcı varsayımı) × token. Token'ı eksik ya da modeli fiyat tablosunda olmayan koşu fiyatlanmaz (0 sayılmaz).
    const prices = subscription.map((x) => apiPriceUsd({ model: shadowModelOf(x), inputTokens: x.inputTokens, outputTokens: x.outputTokens, at: new Date(x.startedAt) }));
    const priced = prices.filter((usd): usd is number => usd !== undefined);
    expect([shadow.pricedRuns, shadow.unpricedRuns]).toEqual([priced.length, subscription.length - priced.length]);
    expect(shadow.usd === undefined).toBe(priced.length === 0);
    if (shadow.usd !== undefined) expect(shadow.usd).toBeCloseTo(priced.reduce((total, usd) => total + usd, 0), 9);
    for (const x of subscription.filter((run) => run.model !== undefined)) expect(x.model?.trim(), `${x.id}: model adı boş olamaz`).toBeTruthy();
    expect(shadow.priceVersion).toBe(PROVIDER_PRICE_VERSION);
    expect((await r.getCostSummary(wsId, cost.month)).month).toBe(cost.month);
    const empty = await r.getCostSummary(wsId, "2000-01");
    expect([empty.apify.runs, empty.llm.runs, empty.subscription.runs, empty.totalCommittedUsd]).toEqual([0, 0, 0, 0]);
    expect(empty.subscription.shadow).toEqual({ pricedRuns: 0, unpricedRuns: 0, unlistedRuns: 0, priceVersion: PROVIDER_PRICE_VERSION });
    expectDescending(runs.map((x) => ms(x.startedAt)), "runs");
    expect((await allRuns(r, { provider: "apify" })).every((x) => x.provider === "apify")).toBe(true);
    const bad: string[] = ["failed", "timed_out"];
    expect((await allRuns(r, { status: ["failed", "timed_out"] })).every((x) => bad.includes(x.status))).toBe(true);
    const since = runs[Math.floor(runs.length / 2)].startedAt;
    expect((await allRuns(r, { since })).every((x) => (ms(x.startedAt) as number) >= (ms(since) as number))).toBe(true);
    expect((await r.listRuns(wsId, { limit: 3 })).items.length).toBeLessThanOrEqual(3);
  });

  it("listRuns sayfalama: cursor her koşuyu bir kez gezer (küçük sayfa = büyük sayfa), limit üst sınırı, toplam tutarlı", async () => {
    const r = create();
    const all = await allRuns(r);
    const small = await allRuns(r, {}, 4);
    expect(small.map((x) => x.id)).toEqual(all.map((x) => x.id));
    expect(new Set(small.map((x) => x.id)).size).toBe(small.length);
    const first = await r.listRuns(wsId, { limit: 4 });
    expect(first.items).toHaveLength(Math.min(4, all.length));
    if (all.length > 4) expect(first.nextCursor).toBeDefined();
    if (first.total !== undefined) expect(first.total).toBe(all.length);
    expect((await r.listRuns(wsId, { limit: 10_000 })).items.length).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
    expectDescending(small.map((x) => ms(x.startedAt)), "sayfalı koşular");
  });

  it("ölçülemeyenler: gizli/bulunamayan rakip ve başarısız koşu listede", async () => {
    const r = create();
    const entries = await r.listUnmeasured(wsId);
    for (const e of entries) {
      expect(["content", "competitor", "account", "source"]).toContain(e.scope);
      expect(e.reason.trim().length > 0 && e.source.trim().length > 0).toBe(true);
    }
    const refs = new Set(entries.map((e) => e.refId));
    for (const c of await r.listCompetitors(wsId, { status: ["private", "not_found"] })) expect(refs.has(c.id), c.handle).toBe(true);
    const broken = await allRuns(r, { status: ["failed", "timed_out", "aborted"] });
    for (const x of broken) expect(refs.has(x.id), x.id).toBe(true);
  });

  it("genel bakış: dönem, KPI'lar, günlük seriler ve son outlier'lar", async () => {
    const r = create();
    for (const days of [30, 7]) {
      const o = await r.getOverview(wsId, days === 30 ? undefined : { days });
      expect(o.days).toBe(days);
      expect(new Set(o.kpis.map((k) => k.key)).size).toBe(o.kpis.length);
      for (const k of o.kpis) {
        if (k.value === undefined) expect(k.unmeasuredReason, k.key).toBeTruthy();
        if (k.unit === "percent" && k.value !== undefined) expect(k.value >= 0 && k.value <= 1, k.key).toBe(true);
      }
      for (const t of o.trends) {
        expect(t.points, t.key).toHaveLength(days);
        expect(t.points.every((p) => DAY_KEY.test(p.date))).toBe(true);
        expect(t.points.map((p) => p.date)).toEqual([...new Set(t.points.map((p) => p.date))].sort());
      }
      expect(o.recentOutliers.every((c) => c.owner.kind === "competitor" && (c.score.liftTier ?? -1) >= 3)).toBe(true);
      expect(o.cost.month).toMatch(MONTH_KEY);
    }
  });

  it("genel bakış: accountId KPI/trend/tutanları o hesaba, platform tutanları platforma süzer", async () => {
    const r = create();
    const overall = await r.getOverview(wsId);
    const value = (o: typeof overall, key: string) => o.kpis.find((k) => k.key === key)?.value;
    const accounts = await r.listOwnAccounts(wsId);
    const perAccount = await Promise.all(accounts.map(async (a) => ({ a, o: await r.getOverview(wsId, { accountId: a.id }) })));
    for (const { a, o } of perAccount) {
      expect(o.days).toBe(overall.days);
      expect(o.kpis.map((k) => k.key)).toEqual(overall.kpis.map((k) => k.key));
      expect(o.trends.map((t) => t.key)).toEqual(overall.trends.map((t) => t.key));
      if (a.followers !== undefined) expect(value(o, "followers"), a.id).toBe(a.followers);
      expect(o.recentOutliers.every((c) => c.owner.kind === "competitor" && (c.score.liftTier ?? -1) >= 3 && c.platform === a.platform), a.id).toBe(true);
    }
    // Hesap toplamları genel toplamı verir (sayılabilir KPI'lar; izlenme yuvarlama payıyla).
    const sum = (key: string) => perAccount.reduce((s, { o }) => s + (value(o, key) ?? NaN), 0);
    expect(sum("posts")).toBe(value(overall, "posts"));
    if (accounts.every((a) => a.followers !== undefined)) expect(sum("followers")).toBe(value(overall, "followers"));
    const totalViews = value(overall, "views");
    if (totalViews !== undefined && !Number.isNaN(sum("views"))) expect(Math.abs(sum("views") - totalViews)).toBeLessThanOrEqual(accounts.length);
    // Platform süzgeci rakip tutanları da süzer.
    for (const platform of new Set(accounts.map((a) => a.platform))) {
      const o = await r.getOverview(wsId, { platform });
      expect(o.recentOutliers.every((c) => c.platform === platform), platform).toBe(true);
    }
    await expectCode(r.getOverview(wsId, { accountId: MISSING_ID }), "not_found");
  });
}
