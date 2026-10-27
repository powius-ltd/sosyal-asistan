/**
 * Sözleşme parçası: Kreatif Anatomisi (`getAnatomy`). Şekil (kapsam, serileştirilebilirlik, hata kodları, ölçülemeyen = sebepli) ve
 * DAVRANIŞ (video seçici içerikle tutarlı, niş dışı girmez, Karşılaştırma ile aynı hook türü sayısı, kohortlar, n < 3 → undefined +
 * sebep, hesaba daraltma kendi tarafı böler). Hesap mock ve Supabase'de AYNI fonksiyondur (`lib/anatomy` `buildAnatomy`).
 */
import { expect, it } from "vitest";

import {
  ANATOMY_SCHEMA_VERSION,
  CTA_POSITIONS,
  FIRST_SECTION_BUCKETS,
  HOOK_LENGTH_BUCKETS,
  RECIPE_COHORTS,
  TEMPO_BUCKETS,
  type AnatomyDimension,
  type AnatomySection,
} from "@/lib/domain/anatomy";
import { DEFAULT_INSIGHTS_DAYS, MAX_INSIGHTS_DAYS, MIN_INSIGHTS_DAYS } from "@/lib/data/queries";
import { expectCode, expectDescending, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

/** Kohort metriğinin dayandığı en az video sayısı (`lib/anatomy/recipe.ts` `MIN_RECIPE_N`). */
const MIN_N = 3;

const total = (stats: { n: number }[]) => stats.reduce((sum, g) => sum + g.n, 0);

export function anatomyContract(ctx: ContractContext): void {
  const { wsId, foreign, create, allContent } = ctx;

  it("getAnatomy: kapsam, sayaçlar ve serileştirilebilir şekil; ölçülemeyen bölüm sebebiyle gelir", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    const report = await r.getAnatomy(wsId);
    expect(report.schemaVersion).toBe(ANATOMY_SCHEMA_VERSION);
    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.scope).toMatchObject({ workspaceId: wsId, days: DEFAULT_INSIGHTS_DAYS });
    expect(Date.parse(report.scope.until)).toBeGreaterThan(Date.parse(report.scope.since));
    expect(report.scope.winnerMinLift).toBeGreaterThan(0);
    for (const n of Object.values(report.counts)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    expect(report.counts.own + report.counts.rivals, "analizli videolar kendi + rakip").toBe(report.counts.analyzed);
    expect(report.videos).toHaveLength(report.counts.analyzed);
    expectDescending(report.videos.map((v) => v.currentLift), "video seçici lift'e göre azalan (ölçülemeyen sonda)");
    for (const entry of report.unmeasured) expect(entry.reason.trim().length, entry.section).toBeGreaterThan(0);
    // PDF "Reels Kreatif Röntgeni" bundan üretilir: düz veri (Date/Map/fonksiyon yok), JSON gidiş-dönüşü kayıpsız.
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("getAnatomy: days kırpılır; hesaba daraltma kapsama yansır; bilinmeyen hesap/workspace → not_found", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    expect((await r.getAnatomy(wsId, { days: 1 })).scope.days).toBe(MIN_INSIGHTS_DAYS);
    expect((await r.getAnatomy(wsId, { days: 100_000 })).scope.days).toBe(MAX_INSIGHTS_DAYS);
    const account = (await r.listOwnAccounts(wsId))[0];
    const narrowed = await r.getAnatomy(wsId, { accountId: account.id });
    expect(narrowed.scope.accountId).toBe(account.id);
    expect(narrowed.scope.ownHandles).toEqual([account.handle]);
    await expectCode(r.getAnatomy(wsId, { accountId: MISSING_ID }), "not_found");
    await expectCode(r.getAnatomy(foreign), "not_found");
  });

  it("getAnatomy: video seçici içerikle tutarlı; niş dışı video girmez; hook türü sayısı Karşılaştırma (getInsights) ile aynı", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    const report = await r.getAnatomy(wsId);
    expect(report.counts.analyzed, "seed analizli video içermeli").toBeGreaterThan(0);
    const content = new Map((await allContent(r)).map((c) => [c.id, c]));
    const offNiche = await ctx.offNicheIds();
    expect(new Set(report.videos.map((v) => v.contentItemId)).size, "video tekrarsız").toBe(report.videos.length);
    for (const video of report.videos) {
      const item = content.get(video.contentItemId);
      expect(item, `${video.contentItemId}: içerik listesinde`).toBeDefined();
      expect(item?.format).toBe("short_video");
      expect(video.ownerHandle).toBe(item?.owner.handle);
      expect(video.isOwn).toBe(item?.owner.kind === "own");
      expect(video.currentLift).toBe(item?.score.lift);
      expect(offNiche.has(video.contentItemId), `${video.contentItemId}: niş dışı video rapora girmez`).toBe(false);
    }
    // Karşılaştırma ekranının hook türü tablosuyla AYNI video kümesi (tek kural: iki ekran iki ayrı sayı göstermez).
    const insights = await r.getInsights(wsId);
    expect(report.videos.filter((v) => v.isOwn && v.hookType !== undefined).length).toBe(total(insights.hookTypes.own));
    expect(report.videos.filter((v) => !v.isOwn && v.hookType !== undefined).length).toBe(total(insights.hookTypes.competitors));
  });

  it("getAnatomy: boyut tabloları sıralı kovalarda, sayılar sayaçları aşmaz; boş tablo sebebiyle gelir", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    const report = await r.getAnatomy(wsId);
    const { own, rivals } = report.counts;
    const dimensions: [AnatomySection, AnatomyDimension, readonly string[]][] = [
      ["hook_length", report.hookLength, HOOK_LENGTH_BUCKETS],
      ["first_section", report.firstSection, FIRST_SECTION_BUCKETS],
      ["cta_position", report.ctaPosition, CTA_POSITIONS],
      ["tempo", report.tempo, TEMPO_BUCKETS],
    ];
    for (const [section, dim, order] of dimensions) {
      for (const [side, limit] of [[dim.grouped.own, own], [dim.grouped.competitors, rivals]] as const) {
        const keys = side.map((g) => g.key);
        expect(keys, `${section}: kova sırası`).toEqual(order.filter((k) => keys.includes(k)));
        expect(total([...side]), `${section}: sayı video sayısını aşmaz`).toBeLessThanOrEqual(limit);
        for (const g of side) {
          expect(g.liftN).toBeLessThanOrEqual(g.n);
          if (g.liftN === 0) expect(g.medianLift, `${section}/${g.key}: lift yoksa 0 değil undefined`).toBeUndefined();
        }
      }
      const emptySide = dim.grouped.own.length === 0 || dim.grouped.competitors.length === 0;
      expect(Boolean(dim.unmeasuredReason), `${section}: boş taraf sebebiyle gelir`).toBe(emptySide);
      if (dim.grouped.own.length === 0 && dim.grouped.competitors.length === 0) {
        expect(report.unmeasured.some((u) => u.section === section), `${section}: tamamen boş bölüm unmeasured'da`).toBe(true);
      }
    }
    // Gövde karışımı: her satırda var + yok toplamı aynı video kümesini böler (satırlar arası eşit).
    const sides = report.bodyMix.map((row) => [total(row.presence.own), total(row.presence.competitors)]);
    for (const side of sides) expect(side, "gövde karışımı: tüm satırlarda aynı toplam").toEqual(sides[0]);
    for (const [ownTotal, rivalTotal] of sides) {
      expect(ownTotal).toBeLessThanOrEqual(own);
      expect(rivalTotal).toBeLessThanOrEqual(rivals);
    }
  });

  it("getAnatomy: reçete kohortları sayaçlarla tutarlı; n < 3 → değer undefined + sebep (0 değil); fark metni iki taraf ölçülmüşse", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    const { recipe, counts } = await r.getAnatomy(wsId);
    expect(recipe.cohorts.map((c) => c.key)).toEqual([...RECIPE_COHORTS]);
    const byKey = new Map(recipe.cohorts.map((c) => [c.key, c]));
    expect(byKey.get("winners")?.videoCount, "tutan kohortu = counts.winners").toBe(counts.winners);
    expect(byKey.get("own")?.videoCount, "kendi kohortu = counts.own").toBe(counts.own);
    expect(byKey.get("other_rivals")?.videoCount).toBeLessThanOrEqual(counts.rivals);
    for (const cohort of recipe.cohorts) {
      expect(Object.keys(cohort.metrics).length).toBeGreaterThan(0);
      for (const v of [...Object.values(cohort.metrics), ...Object.values(cohort.bodyShares)]) {
        expect(v.n).toBeLessThanOrEqual(cohort.videoCount);
        if (v.n < MIN_N) {
          expect(v.value, `${cohort.key}: n < 3 ise 0 değil undefined`).toBeUndefined();
          expect((v.reason ?? "").length, `${cohort.key}: sebep yazılır`).toBeGreaterThan(0);
        } else {
          expect(v.value).toBeDefined();
          expect(v.reason).toBeUndefined();
        }
      }
    }
    for (const d of recipe.differences) {
      const both = d.ownValue !== undefined && d.winnersValue !== undefined;
      expect(d.text !== undefined, `${d.metric}: metin yalnız iki taraf ölçülmüşse`).toBe(both);
      expect(d.reason !== undefined, `${d.metric}: değilse sebep`).toBe(!both);
    }
  });

  it("getAnatomy: hesaba daraltma kendi tarafı böler, rakip tarafı aynı kalır", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "anatomy", () => r.getAnatomy(wsId));
    const full = await r.getAnatomy(wsId);
    let ownTotal = 0;
    for (const account of await r.listOwnAccounts(wsId)) {
      const narrowed = await r.getAnatomy(wsId, { accountId: account.id });
      ownTotal += narrowed.counts.own;
      expect(narrowed.counts.rivals, `${account.handle}: rakip tarafı değişmez`).toBe(full.counts.rivals);
      expect(narrowed.videos.every((v) => !v.isOwn || v.ownerHandle === account.handle)).toBe(true);
    }
    expect(ownTotal, "hesapların kendi videoları toplamı tüm kendi videolara eşit").toBe(full.counts.own);
  });
}
