/**
 * Sözleşme parçası: reklam okumaları (`listAdAccounts`, `getAdReport`, `getAdDetail`, `listAdUsage`). Her iki depo AYNI tohumla
 * (`generators/ads.ts`: 2 hesap, 6 reklam, 35 günlük seri) koşar; sorgu zamanı `MOCK_NOW`'dır (tohum günleri buna göredir).
 * ŞEKİL: toplam = reklam toplamı, ölçülemeyen `undefined` (0 değil), karar `undecided` (R0'da kural yok). DAVRANIŞ: hesap yokken boş liste,
 * dönem süzgeci, bilinmeyen hesap / reklam `not_found`, başka çalışma alanı görünmez, her rapor TEK hesabın (para birimi karışmaz).
 * Reklam hesabına YAZAN metot yoktur (arayüzde de yok): bu parça yalnız okur.
 */
import { expect, it } from "vitest";

import type { AdGoalInput } from "@/lib/data/ad-schema";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";

const NOW = new Date(MOCK_NOW);

export function adsContract(ctx: ContractContext) {
  it("ads: bilinmeyen çalışma alanı boş liste verir, rapor not_found", async () => {
    const r = ctx.create();
    expect(await r.listAdAccounts(ctx.foreign)).toEqual([]);
    await expectCode(r.getAdReport(ctx.foreign, {}, NOW), "not_found");
  });

  it("ads: hesaplar sıralı ve biçimli; her hesap kendi para biriminde", async () => {
    const accounts = await ctx.create().listAdAccounts(ctx.wsId);
    expect(accounts.length).toBeGreaterThanOrEqual(2);
    const labels = accounts.map((a) => a.label ?? "");
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "tr")));
    for (const a of accounts) {
      expect(a.workspaceId).toBe(ctx.wsId);
      expect(a.currency).toMatch(/^[A-Z]{3}$/);
      expect(a.provider).toBe("zernio");
    }
    expect(new Set(accounts.map((a) => a.currency)).size).toBeGreaterThanOrEqual(2);
  });

  it("ads: rapor tek hesabın; toplam reklam toplamına eşit; karar gerekçeli (undecided yalnız hedefsiz hesapta); ölçülemeyen undefined", async () => {
    const r = ctx.create();
    for (const account of await r.listAdAccounts(ctx.wsId)) {
      const report = await r.getAdReport(ctx.wsId, { accountId: account.id }, NOW);
      expect(report?.account.id).toBe(account.id);
      if (report === undefined) continue;
      expect(report.period.days).toBe(28);
      expect(report.period.to).toBe(MOCK_NOW.slice(0, 10));
      const sum = report.ads.reduce((total, ad) => total + ad.sums.spend, 0);
      expect(report.totals.sums.spend).toBeCloseTo(sum, 6);
      for (const ad of report.ads) {
        expect(ad.verdict.reasons.length, `${ad.ad.name}: kararın gerekçesi`).toBeGreaterThan(0);
        if (ad.verdict.status === "undecided") expect(account.goal, `${ad.ad.name}: undecided yalnız hedefsiz hesapta`).toBeUndefined();
        else expect(account.goal).toBeDefined();
        if (ad.sums.results === undefined) {
          expect(ad.metrics.costPerResult, `${ad.ad.name}: sonuç ölçülmeyen reklamda sonuç maliyeti`).toBeUndefined();
          expect(ad.metrics.returnOnSpend).toBeUndefined();
        }
        for (const value of Object.values(ad.metrics)) expect(value === undefined || Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("ads: varsayılan rapor ilk hesabındır; dönem süzgeci harcamayı daraltır; geçersiz girdi invalid_input", async () => {
    const r = ctx.create();
    const [first] = await r.listAdAccounts(ctx.wsId);
    const wide = await r.getAdReport(ctx.wsId, {}, NOW);
    const narrow = await r.getAdReport(ctx.wsId, { days: 7 }, NOW);
    expect(wide?.account.id).toBe(first?.id);
    expect(narrow?.period.days).toBe(7);
    expect(narrow?.totals.sums.spend ?? 0).toBeLessThan(wide?.totals.sums.spend ?? 0);
    await expectCode(r.getAdReport(ctx.wsId, { days: 0 }, NOW), "invalid_input");
    await expectCode(r.getAdReport(ctx.wsId, { days: 9999 }, NOW), "invalid_input");
    await expectCode(r.getAdReport(ctx.wsId, { accountId: MISSING_ID }, NOW), "not_found");
  });

  it("ads: reklam ayrıntısı günlük seriyle tutarlı; bilinmeyen reklam not_found", async () => {
    const r = ctx.create();
    const report = await r.getAdReport(ctx.wsId, {}, NOW);
    const target = report?.ads[0];
    expect(target).toBeDefined();
    if (target === undefined) return;
    const detail = await r.getAdDetail(ctx.wsId, target.ad.id, {}, NOW);
    expect(detail.result.ad.id).toBe(target.ad.id);
    // Açık gün (dönemin son günü, yarım) ham seride görünür ama ölçülere girmez: toplam kapanmış günlerin toplamıdır.
    expect(detail.series.filter((row) => row.date < detail.period.to).reduce((total, row) => total + row.spend, 0)).toBeCloseTo(target.sums.spend, 6);
    const dates = detail.series.map((row) => row.date);
    expect(dates).toEqual([...dates].sort());
    await expectCode(r.getAdDetail(ctx.wsId, MISSING_ID, {}, NOW), "not_found");
    await expectCode(r.getAdDetail(ctx.foreign, target.ad.id, {}, NOW), "not_found");
  });

  it("ads: kullanım yalnız kreatife bağlı içerik için satır verir", async () => {
    const r = ctx.create();
    expect(await r.listAdUsage(ctx.wsId, [], NOW)).toEqual([]);
    expect(await r.listAdUsage(ctx.wsId, [MISSING_ID], NOW)).toEqual([]);
    const reports = await Promise.all((await r.listAdAccounts(ctx.wsId)).map((a) => r.getAdReport(ctx.wsId, { accountId: a.id }, NOW)));
    const linked = reports.flatMap((report) => report?.ads ?? []).find((ad) => ad.creative?.sourceContentId !== undefined);
    const contentId = linked?.creative?.sourceContentId;
    expect(contentId, "tohumda kendi içeriğe bağlı kreatif olmalı").toBeDefined();
    if (contentId === undefined) return;
    const usage = await r.listAdUsage(ctx.wsId, [contentId, MISSING_ID], NOW);
    expect(usage.map((u) => u.contentItemId)).toEqual([contentId]);
    expect(usage[0]?.creativeCount).toBeGreaterThanOrEqual(1);
    expect(usage[0]?.adRefs.length).toBeGreaterThanOrEqual(1);
    expect(await r.listAdUsage(ctx.foreign, [contentId], NOW).catch((e: { code?: string }) => e.code)).toBe("not_found");
  });

  it("ads: hedef yazımı yalnız hedef alanlarını değiştirir, geri alınır; geçersiz biçim invalid_input; başka çalışma alanı not_found", async () => {
    const r = ctx.create();
    const accounts = await r.listAdAccounts(ctx.wsId);
    const target = accounts.find((account) => account.goal === undefined) ?? accounts[0];
    expect(target).toBeDefined();
    if (target === undefined) return;
    const original = target.goal;
    try {
      const costGoal = { kind: "cost", resultLabel: "mesaj", targetCostPerResult: 25 } as const;
      const updated = await r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: costGoal });
      expect(updated.goal).toEqual(costGoal);
      expect({ ...updated, goal: undefined }).toEqual({ ...target, goal: undefined });
      const valueGoal = { kind: "value", resultLabel: "satın alma", targetReturn: 2.5, grossMargin: 0.4 } as const;
      expect((await r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: valueGoal })).goal).toEqual(valueGoal);
      const cleared = await r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: null });
      expect(cleared.goal).toBeUndefined();
      expect((await r.listAdAccounts(ctx.wsId)).find((account) => account.id === target.id)?.goal).toBeUndefined();
      await expectCode(r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: { kind: "cost", resultLabel: "x" } as never }), "invalid_input");
      await expectCode(r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: { kind: "value", resultLabel: "x", targetReturn: 0 } as never }), "invalid_input");
      await expectCode(r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: { kind: "cost", resultLabel: "x", targetCostPerResult: 5, targetReturn: 2 } as never }), "invalid_input");
      await expectCode(r.updateAdAccountGoal(ctx.wsId, { accountId: MISSING_ID, goal: costGoal }), "not_found");
      await expectCode(r.updateAdAccountGoal(ctx.foreign, { accountId: target.id, goal: costGoal }), "not_found");
    } finally {
      await r.updateAdAccountGoal(ctx.wsId, { accountId: target.id, goal: (original ?? null) as AdGoalInput | null }).catch(() => undefined);
    }
  });
}
