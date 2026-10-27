/**
 * Sözleşme parçası: içgörülerin konu eleği ve analiz bağlantıları (`getInsights`). İki depo AYNI davranışı vermeli:
 *  - niş dışı (konu eleği) içerik süre/CTA/hook grup tablolarına GİRMEZ ama hesap satırında sayılır ve "niş dışı" rozetiyle işaretlenir;
 *  - hook türü grupları YALNIZ `ok` + kanıtı doğrulanmış analizlerden (hook kütüphanesiyle aynı küme), kendi/rakip ayrı, niş dışı girmez;
 *  - grup güveni örnek sayısından + baz çizgisi tavanı (`capConfidenceForBaseline`); analizi/ölçümü olmayan taraf sebeple işaretlenir;
 *  - en sık saatler (`commonHours`) tutarlı.
 * Seed gereksinimleri: `RepositoryContractOptions.offNicheContentIds` (bkz. `repository.contract.ts`).
 */
import { expect, it } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import type { GroupedLift, Insights } from "@/lib/domain/insights";
import { durationBucketOf } from "@/lib/domain/taxonomy";
import { capConfidenceForBaseline, confidenceForSample } from "@/lib/domain/weekly-plan";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { classifyCta } from "@/lib/data/views/insights-cta";
import { allPages, medianOf, type ContractContext } from "@/lib/data/contract/support";

export function insightsNicheContract(ctx: ContractContext): void {
  const { wsId, create, allContent, offNicheIds } = ctx;

  /** Pencere içi (`scope.since..until`) kısa videolar, satırların sahipleri için (= `buildInsights`'ın baktığı küme). */
  async function windowVideos(r: PanelRepository, insights: Insights): Promise<ContentItem[]> {
    const since = Date.parse(insights.scope.since);
    const until = Date.parse(insights.scope.until);
    const out: ContentItem[] = [];
    for (const row of insights.rows) {
      const videos = await allContent(r, { ownerId: row.subjectId, format: "short_video" });
      out.push(...videos.filter((c) => c.publishedAt !== undefined && Date.parse(c.publishedAt) >= since && Date.parse(c.publishedAt) <= until));
    }
    return out;
  }

  const total = (g: GroupedLift) => [...g.own, ...g.competitors].reduce((sum, stat) => sum + stat.n, 0);

  it("niş dışı (konu eleği): hesap satırında sayılır ve rozetlenir; süre/CTA grup tablolarına girmez", async () => {
    const r = create();
    const offNiche = await offNicheIds();
    const insights = await r.getInsights(wsId);
    const videos = await windowVideos(r, insights);
    const flagged = videos.filter((c) => offNiche.has(c.id));
    expect(flagged.length, "seed: pencere içi, izlenen-rakip sahipli en az bir niş dışı kısa video").toBeGreaterThan(0);

    for (const row of insights.rows) {
      const own = videos.filter((c) => c.owner.id === row.subjectId);
      expect(row.videoCount, `${row.handle}: niş dışı video satırda sayılır`).toBe(own.length);
      const badge = row.quality.find((q) => q.kind === "off_niche");
      expect(badge?.count ?? 0, `${row.handle}: rozet sayısı seed'in işaretledikleri`).toBe(own.filter((c) => offNiche.has(c.id)).length);
      if (badge) expect(badge.total, `${row.handle}: rozet toplamı`).toBe(row.videoCount);
    }

    const grouped = videos.filter((c) => !offNiche.has(c.id));
    expect(total(insights.durationBuckets as GroupedLift), "süre kovaları yalnız niş içi").toBe(grouped.filter((c) => durationBucketOf(c.durationSec) !== undefined).length);
    expect(total(insights.ctaTypes as GroupedLift), "CTA grupları yalnız niş içi").toBe(grouped.filter((c) => classifyCta(c.caption) !== undefined).length);
  });

  it("hook türü grupları: yalnız ok + doğrulanmış analiz (hook kütüphanesiyle aynı küme), kendi/rakip ayrı, niş dışı girmez; güven baz çizgisi tavanlı", async () => {
    const r = create();
    const offNiche = await offNicheIds();
    const insights = await r.getInsights(wsId);
    const videos = await windowVideos(r, insights);
    const byId = new Map(videos.map((c) => [c.id, c]));
    const library = await allPages((cursor) => r.listHookLibrary(wsId, { limit: MAX_PAGE_LIMIT, cursor }));

    // Beklenen: pencere içi, niş içi, kütüphanedeki (status = ok ∧ evidenceVerified) videolar; kendi ve rakip ayrı, hook türü analizden.
    const expected = new Map<string, ContentItem[]>();
    for (const entry of library) {
      const item = byId.get(entry.contentId);
      if (!item || offNiche.has(item.id)) continue;
      const key = `${item.owner.kind === "own" ? "own" : "competitors"}:${entry.hookType}`;
      expected.set(key, [...(expected.get(key) ?? []), item]);
    }
    expect(expected.size, "seed: pencere içi, niş içi, ok + doğrulanmış analizli kısa video").toBeGreaterThan(0);

    const actual = new Map<string, ContentItem[]>();
    for (const side of ["own", "competitors"] as const) {
      const groups = insights.hookTypes[side];
      const keys = groups.map((g) => g.key);
      expect(new Set(keys).size, `${side}: grup tekrarsız`).toBe(keys.length);
      const known = keys.filter((k) => HOOK_TYPES.includes(k));
      expect(known, `${side}: taksonomideki türler taksonomi sırasında`).toEqual(HOOK_TYPES.filter((k) => known.includes(k)));
      expect(keys.slice(0, known.length), `${side}: taksonomi dışı türler sonda`).toEqual(known);

      for (const g of groups) {
        const items = expected.get(`${side}:${g.key}`) ?? [];
        actual.set(`${side}:${g.key}`, items);
        expect(g.n, `${side}/${g.key}: video sayısı analizli + niş içi videolar`).toBe(items.length);
        const measured = items.filter((c) => !c.score.immature && c.score.lift !== undefined);
        expect(g.liftN, `${side}/${g.key}: liftN olgun + ölçülmüş`).toBe(measured.length);
        if (measured.length === 0) {
          expect([g.medianLift, g.lowBaselineShare], `${side}/${g.key}: ölçülemeyen = undefined (0 değil)`).toEqual([undefined, undefined]);
        } else {
          expect(g.medianLift).toBeCloseTo(medianOf(measured.map((c) => c.score.lift as number)), 9);
          const share = measured.filter((c) => c.score.lowConfidence).length / measured.length;
          expect(g.lowBaselineShare).toBeCloseTo(share, 9);
          expect(g.confidence, `${side}/${g.key}: güven = örnek sayısı + baz çizgisi tavanı`).toBe(capConfidenceForBaseline(confidenceForSample(g.liftN), share));
        }
      }
    }
    expect([...actual.keys()].sort(), "hook grupları = kütüphanedeki pencere içi niş içi videoların türleri").toEqual([...expected.keys()].sort());
  });

  it("ölçülemeyen sebebi: hook türü tablosunun boş kalan tarafı için tek sebep yazılır; ikisi de doluysa sebep yok", async () => {
    const r = create();
    const insights = await r.getInsights(wsId);
    const hookReasons = insights.unmeasured.filter((u) => u.section === "hook_types");
    expect(hookReasons.length, "bölüm başına tek sebep").toBeLessThanOrEqual(1);
    expect(hookReasons.every((u) => u.reason.trim() !== "")).toBe(true);
    const tracked = insights.rows.some((row) => row.subjectKind === "competitor");
    const hasOwn = insights.rows.some((row) => row.subjectKind === "own");
    const missingSide = (hasOwn && insights.hookTypes.own.length === 0) || (tracked && insights.hookTypes.competitors.length === 0);
    expect(hookReasons.length > 0, "boş taraf varsa sebep, yoksa sebep yok").toBe(missingSide);
  });

  it("en sık saatler (commonHours): en çok 3, n azalan sonra saat artan; dilimlerle tutarlı; ölçülemeyen lift undefined", async () => {
    const r = create();
    const insights = await r.getInsights(wsId);
    for (const row of insights.rows) {
      const { commonHours, commonSlots } = row.posting;
      expect(commonHours.length, row.handle).toBeLessThanOrEqual(3);
      expect(new Set(commonHours.map((h) => h.hour)).size, `${row.handle}: saat tekrarsız`).toBe(commonHours.length);
      for (let i = 0; i < commonHours.length; i++) {
        const h = commonHours[i];
        expect(h.hour >= 0 && h.hour <= 23 && h.n >= 1 && h.share > 0 && h.share <= 1, `${row.handle}/${h.hour}`).toBe(true);
        expect(h.liftN, `${row.handle}/${h.hour}: liftN ≤ n`).toBeLessThanOrEqual(h.n);
        if (h.liftN === 0) expect(h.medianLift, `${row.handle}/${h.hour}: lift yoksa 0 değil undefined`).toBeUndefined();
        if (i > 0) {
          const prev = commonHours[i - 1];
          expect(prev.n > h.n || (prev.n === h.n && prev.hour < h.hour), `${row.handle}: n azalan, eşitlikte saat artan`).toBe(true);
        }
      }
      // Bir saatin videosu, o saatteki her gün×saat diliminden en az o kadar (dilim saatin alt kümesidir).
      for (const slot of commonSlots) {
        const hour = commonHours.find((h) => h.hour === slot.hour);
        if (hour) expect(hour.n, `${row.handle}: ${slot.hour}. saat ≥ dilim`).toBeGreaterThanOrEqual(slot.n);
      }
      if (row.videoCount === 0) expect(commonHours, `${row.handle}: video yok → saat yok`).toEqual([]);
    }
  });
}
