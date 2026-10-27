/**
 * Sözleşme parçası: karşılaştırma içgörüleri (`getInsights`; LLM'siz, salt okuma). Hesap mock ve Supabase'de AYNI fonksiyondur
 * (`views/insights`); burada şekil kuralları ve içerikle tutarlılık sınanır: satır sahipleri, video sayıları (içerik listesinden
 * bağımsız hesap), grup sıralaması/güveni, ölçülemeyen = undefined, kapsam ve hata sözleşmesi.
 */
import { expect, it } from "vitest";

import { CTA_TYPES, DURATION_BUCKETS } from "@/lib/domain/taxonomy";
import type { GroupedLift } from "@/lib/domain/insights";
import { capConfidenceForBaseline, confidenceForSample } from "@/lib/domain/weekly-plan";
import { DEFAULT_INSIGHTS_DAYS, MAX_INSIGHTS_DAYS, MIN_INSIGHTS_DAYS } from "@/lib/data/queries";
import { expectCode, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function insightsContract(ctx: ContractContext): void {
  const { wsId, foreign, create, allContent } = ctx;

  function expectGroups(groups: GroupedLift, order: readonly string[], label: string) {
    for (const side of [groups.own, groups.competitors]) {
      const keys = side.map((g) => g.key);
      expect(new Set(keys).size, `${label}: grup tekrarsız`).toBe(keys.length);
      expect(keys, `${label}: taksonomi sırası`).toEqual(order.filter((k) => keys.includes(k)));
      for (const g of side) {
        expect(g.n, `${label}/${g.key}: boş grup dönmez`).toBeGreaterThanOrEqual(1);
        expect(g.liftN).toBeLessThanOrEqual(g.n);
        expect(g.outlierCount).toBeLessThanOrEqual(g.liftN);
        // Güven: örnek sayısından, baz çizgisi tavanıyla (ölçülmüş videoların ≥ %50'si düşük güvenli baz çizgisindeyse en çok orta).
        expect(g.confidence, `${label}/${g.key}: güven liftN'den + baz çizgisi tavanı`).toBe(capConfidenceForBaseline(confidenceForSample(g.liftN), g.lowBaselineShare));
        if (g.liftN === 0) {
          expect([g.medianLift, g.lowBaselineShare], `${label}/${g.key}: lift yoksa 0 değil undefined`).toEqual([undefined, undefined]);
        } else {
          expect(g.medianLift).toBeGreaterThanOrEqual(0);
          expect(g.lowBaselineShare, `${label}/${g.key}: düşük güvenli baz çizgisi payı 0..1`).toBeGreaterThanOrEqual(0);
          expect(g.lowBaselineShare).toBeLessThanOrEqual(1);
        }
      }
    }
  }

  it("şekil: kapsam, satır sahipleri (kendi hesaplar + izlenen rakipler), kendi taraf önce; ölçülemeyen = undefined", async () => {
    const r = create();
    const insights = await r.getInsights(wsId);
    expect(insights.scope.days).toBe(DEFAULT_INSIGHTS_DAYS);
    expect(insights.scope.accountId).toBeUndefined();
    expect(new Date(insights.scope.until).getTime() - new Date(insights.scope.since).getTime()).toBe(DEFAULT_INSIGHTS_DAYS * 86_400_000);
    expect(insights.scope.audienceTimeZone).toBe((await r.getWorkspace(wsId))?.audienceTimeZone);

    const own = await r.listOwnAccounts(wsId);
    const tracked = await r.listCompetitors(wsId, { status: "tracked" });
    expect(insights.rows.filter((x) => x.subjectKind === "own").map((x) => x.subjectId).sort()).toEqual(own.map((a) => a.id).sort());
    expect(insights.rows.filter((x) => x.subjectKind === "competitor").map((x) => x.subjectId).sort()).toEqual(tracked.map((c) => c.id).sort());
    const firstRival = insights.rows.findIndex((x) => x.subjectKind === "competitor");
    expect(insights.rows.slice(firstRival < 0 ? insights.rows.length : firstRival).every((x) => x.subjectKind === "competitor"), "kendi satırlar önce").toBe(true);

    for (const row of insights.rows) {
      expect(row.videoCount, row.handle).toBeGreaterThanOrEqual(0);
      if (row.followers === undefined || row.medianViews === undefined) expect(row.medianViewsPerFollower, `${row.handle}: ölçülemeyen oran`).toBeUndefined();
      else expect(row.medianViewsPerFollower).toBeCloseTo(row.medianViews / row.followers, 9);
      if (row.videoCount === 0) {
        expect([row.medianViews, row.medianLift, row.outlierCount, row.commentCtaShare], `${row.handle}: video yoksa 0 değil undefined`).toEqual([undefined, undefined, undefined, undefined]);
        expect(row.quality).toEqual([]);
      }
      for (const badge of row.quality) expect(badge.count >= 1 && badge.count <= badge.total, `${row.handle}/${badge.kind}`).toBe(true);
      for (const slot of row.posting.commonSlots) expect(slot.weekday >= 0 && slot.weekday <= 6 && slot.hour >= 0 && slot.hour <= 23 && slot.n >= 1).toBe(true);
      expect(row.posting.commonSlots.length).toBeLessThanOrEqual(3);
      if (row.posting.topSlotShare !== undefined) expect(row.posting.topSlotShare > 0 && row.posting.topSlotShare <= 1).toBe(true);
      expect(row.voice.sampleSize).toBeLessThanOrEqual(row.videoCount);
    }
    expect(insights.unmeasured.every((u) => u.reason.trim() !== "")).toBe(true);
    expect(insights.similarSize.count).toBe(insights.similarSize.handles.length);
  });

  it("video sayıları içerik listesiyle tutarlı (pencere içindeki kısa videolar); gruplar taksonomi sırasında", async () => {
    const r = create();
    const insights = await r.getInsights(wsId);
    const since = Date.parse(insights.scope.since);
    const until = Date.parse(insights.scope.until);
    for (const row of insights.rows) {
      const videos = (await allContent(r, { ownerId: row.subjectId, format: "short_video" })).filter((c) => {
        const at = c.publishedAt ? Date.parse(c.publishedAt) : Number.NaN;
        return at >= since && at <= until;
      });
      expect(row.videoCount, row.handle).toBe(videos.length);
    }
    expectGroups(insights.durationBuckets as GroupedLift, DURATION_BUCKETS, "süre");
    expectGroups(insights.ctaTypes as GroupedLift, CTA_TYPES, "cta");
    const total = (g: GroupedLift) => [...g.own, ...g.competitors].reduce((s, x) => s + x.n, 0);
    const videosWithDuration = insights.rows.reduce((s, x) => s + x.videoCount, 0);
    expect(total(insights.durationBuckets as GroupedLift), "kovalardaki video toplamı ≤ toplam video").toBeLessThanOrEqual(videosWithDuration);
  });

  it("kapsam: accountId kendi tarafı o hesaba daraltır (rakipler aynı); days kırpılır; bilinmeyen hesap/workspace not_found; okuma deterministik", async () => {
    const r = create();
    const all = await r.getInsights(wsId);
    const [first] = await r.listOwnAccounts(wsId);
    const one = await r.getInsights(wsId, { accountId: first.id });
    expect(one.scope.accountId).toBe(first.id);
    expect(one.rows.filter((x) => x.subjectKind === "own").map((x) => x.subjectId)).toEqual([first.id]);
    expect(one.rows.filter((x) => x.subjectKind === "competitor").map((x) => x.subjectId).sort()).toEqual(all.rows.filter((x) => x.subjectKind === "competitor").map((x) => x.subjectId).sort());
    expect((await r.getInsights(wsId, { days: 1 })).scope.days).toBe(MIN_INSIGHTS_DAYS);
    expect((await r.getInsights(wsId, { days: 100_000 })).scope.days).toBe(MAX_INSIGHTS_DAYS);
    await expectCode(r.getInsights(wsId, { accountId: MISSING_ID }), "not_found");
    await expectCode(r.getInsights(foreign), "not_found");
    // Canlı saatli depoda (Supabase) pencere uçları her okumada kayar: içerik (satırlar, gruplar) aynı kalmalı.
    const stable = (x: typeof all) => ({ ...x, scope: { ...x.scope, since: "", until: "" } });
    expect(stable(await r.getInsights(wsId)), "aynı okuma aynı sonuç").toEqual(stable(all));
  });
}
