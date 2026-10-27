/**
 * Sözleşme parçası: tutan içerikler, rakipler, keşif adayları ve rakip ekleme.
 */
import { expect, it } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { MAX_PAGE_LIMIT, type OutlierFilter } from "@/lib/data/queries";
import {
  expectCode,
  expectDescending,
  idsOf,
  ignoreCompetitors,
  medianOf,
  MISSING_ID,
  ms,
  type ContractContext,
} from "@/lib/data/contract/support";

export function competitorsContract(ctx: ContractContext): void {
  const { wsId, create, allContent } = ctx;

  it("listOutliers: yalnız izlenen rakip, varsayılan kademe ≥3, filtreler ve sıralamalar", async () => {
    const r = create();
    const all = await allContent(r);
    const own = await r.listOwnAccounts(wsId);
    const tracked = new Set((await r.listCompetitors(wsId, { status: "tracked" })).map((c) => c.id));
    const res = await r.listOutliers(wsId, { limit: MAX_PAGE_LIMIT });
    const expected = new Set(
      idsOf(all.filter((c) => c.owner.kind === "competitor" && tracked.has(c.owner.id) && (c.score.liftTier ?? -1) >= 3)),
    );
    expect(res.items.every((c) => expected.has(c.id))).toBe(true);
    expect(res.items.length).toBe(Math.min(expected.size, MAX_PAGE_LIMIT));
    expectDescending(res.items.map((c) => c.score.lift), "outlier lift");
    const check = async (filter: OutlierFilter, pred: (c: ContentItem) => boolean) => {
      const items = (await r.listOutliers(wsId, { ...filter, limit: MAX_PAGE_LIMIT })).items;
      expect(items.every(pred), JSON.stringify(filter)).toBe(true);
      return items;
    };
    await check({ minTier: 4 }, (c) => (c.score.liftTier ?? -1) >= 4);
    await check({ hideLowConfidence: true, hideImmature: true }, (c) => !c.score.lowConfidence && !c.score.immature);
    await check({ competitorId: res.items[0].owner.id }, (c) => c.owner.id === res.items[0].owner.id);
    const f = (c: ContentItem) => c.owner.followers ?? NaN;
    await check({ similarSizeOnly: true }, (c) =>
      own.some((a) => a.platform === c.platform && a.followers !== undefined && f(c) >= a.followers / 3 && f(c) <= a.followers * 3),
    );
    expectDescending((await check({ sort: "cross" }, () => true)).map((c) => c.score.crossScore), "cross");
    expectDescending((await check({ sort: "recent" }, () => true)).map((c) => ms(c.publishedAt)), "outlier recent");
  });

  it("tutanlar yalnız izlenen rakiplerden: ignored/candidate rakibin içeriği listOutliers ve recentOutliers'ta çıkmaz, izlemeye alınca döner", async () => {
    const r = create();
    const competitors = await r.listCompetitors(wsId);
    const statusOf = new Map(competitors.map((c) => [c.id, c.status]));
    const outliers = (await r.listOutliers(wsId, { limit: MAX_PAGE_LIMIT })).items;
    const overview = await r.getOverview(wsId);
    expect(outliers.every((c) => c.owner.kind === "competitor" && statusOf.get(c.owner.id) === "tracked")).toBe(true);
    expect(overview.recentOutliers.every((c) => statusOf.get(c.owner.id) === "tracked")).toBe(true);
    // Gizli/bulunamayan/yoksayılan/aday rakibin hiçbir içeriği tutanlarda yok (içeriği olsa bile).
    const blocked = new Set(competitors.filter((c) => c.status !== "tracked").map((c) => c.id));
    expect(outliers.some((c) => blocked.has(c.owner.id))).toBe(false);

    const listTarget = outliers[0].owner.id;
    const recentTarget = overview.recentOutliers[0]?.owner.id;
    if (recentTarget === undefined) throw new Error("seed: genel bakışta son tutan içerik yok");
    for (const target of new Set([listTarget, recentTarget])) {
      for (const status of ["ignored", "candidate"] as const) {
        try {
          await r.setCompetitorStatus(wsId, target, status);
          expect((await r.listOutliers(wsId, { limit: MAX_PAGE_LIMIT })).items.some((c) => c.owner.id === target), `${status} listOutliers`).toBe(false);
          expect((await r.listOutliers(wsId, { competitorId: target })).items, `${status} competitorId`).toHaveLength(0);
          expect((await r.getOverview(wsId)).recentOutliers.some((c) => c.owner.id === target), `${status} recentOutliers`).toBe(false);
        } finally {
          await r.setCompetitorStatus(wsId, target, "tracked");
        }
      }
      expect((await r.listOutliers(wsId, { competitorId: target })).items.length).toBeGreaterThan(0);
    }
    expect((await r.getOverview(wsId)).recentOutliers.some((c) => c.owner.id === recentTarget)).toBe(true);
  });

  it("rakipler: filtreler, keşif adayları ve durum değişikliği", async () => {
    const r = create();
    const all = await r.listCompetitors(wsId);
    expect(all.every((c) => c.workspaceId === wsId)).toBe(true);
    const tracked = all.filter((c) => c.status === "tracked" || c.status === "candidate");
    expect(idsOf(await r.listCompetitors(wsId, { status: ["tracked", "candidate"] }))).toEqual(idsOf(tracked));
    expect((await r.listCompetitors(wsId, { source: "manual" })).every((c) => c.source === "manual")).toBe(true);
    expect((await r.listCompetitors(wsId, { search: all[0].handle.toUpperCase() })).some((c) => c.id === all[0].id)).toBe(true);
    const discovery = await r.listDiscoveryCandidates(wsId);
    const candidates = all.filter((c) => c.status === "candidate" && c.source !== "manual");
    expect(discovery.map((d) => d.competitorId).sort()).toEqual(idsOf(candidates));
    expect((await r.listDiscoveryCandidates(wsId, { similarSizeOnly: true })).every((d) => d.similarSize === true)).toBe(true);
    expect((await r.listDiscoveryCandidates(wsId, { limit: 1 })).length).toBeLessThanOrEqual(1);
    const source = discovery[0].source;
    expect((await r.listDiscoveryCandidates(wsId, { source })).every((d) => d.source === source)).toBe(true);
    const target = discovery[0].competitorId;
    try {
      expect((await r.setCompetitorStatus(wsId, target, "tracked")).status).toBe("tracked");
      expect((await r.listCompetitors(wsId, { status: "tracked" })).some((c) => c.id === target)).toBe(true);
    } finally {
      // Geri al: aday olarak kalır (test kirletmez).
      expect((await r.setCompetitorStatus(wsId, target, "candidate")).status).toBe("candidate");
    }
    await expectCode(r.setCompetitorStatus(wsId, MISSING_ID, "ignored"), "not_found");
    for (const c of all.filter((x) => x.status === "private" || x.status === "not_found")) {
      await expectCode(r.setCompetitorStatus(wsId, c.id, "tracked"), "invalid_state");
    }
  });

  it("addCompetitor: handle normalize edilir, tekrar already_exists, geçersiz invalid_input", async () => {
    const r = create();
    const handle = `sozlesme.${Date.now().toString(36)}`;
    const added: string[] = []; // test sonunda `ignored` yapılır (rakip silme API'si yok)
    try {
      const tracked = await r.addCompetitor(wsId, { platform: "instagram", handle: `  @${handle.toUpperCase()} ` });
      added.push(tracked.id);
      expect(tracked).toMatchObject({ workspaceId: wsId, handle, status: "tracked", source: "manual" });
      expect(tracked.followers).toBeUndefined();
      expect((await r.listCompetitors(wsId)).some((c) => c.id === tracked.id)).toBe(true);
      await expectCode(r.addCompetitor(wsId, { platform: "instagram", handle: `@${handle}` }), "already_exists");
      await expectCode(r.addCompetitor(wsId, { platform: "instagram", handle: "geçersiz ad!" }), "invalid_input");
      const candidate = await r.addCompetitor(wsId, { platform: "instagram", handle: `${handle}.aday`, status: "candidate", source: "search" });
      added.push(candidate.id);
      expect((await r.listDiscoveryCandidates(wsId)).some((d) => d.competitorId === candidate.id)).toBe(true);
    } finally {
      await ignoreCompetitors(r, wsId, added);
    }
    // Geri alındı: eklenenler artık izlenmez, keşif adayı olarak da görünmez.
    expect((await r.listCompetitors(wsId, { status: ["tracked", "candidate"] })).some((c) => added.includes(c.id))).toBe(false);
    expect((await r.listDiscoveryCandidates(wsId)).some((d) => added.includes(d.competitorId))).toBe(false);
  });

  it("rakip özetleri: medyan izlenme, tutan sayısı ve sıklık toplanan içerikle tutarlı; ölçülemeyen undefined (0 değil)", async () => {
    const r = create();
    const competitors = await r.listCompetitors(wsId);
    const content = await allContent(r, { ownerKind: "competitor" });
    for (const c of competitors) {
      const own = content.filter((x) => x.owner.id === c.id);
      // Medyan izlenme: YALNIZ kısa video ve rakibin en sık görülen viewsKind'ı (türler/formatlar karışmaz; eşitlikte alfabetik ilk).
      const byKind = new Map<string, number[]>();
      for (const x of own) {
        const { views, viewsKind } = x.metrics;
        if (x.format !== "short_video" || views === undefined || viewsKind === undefined) continue;
        byKind.set(viewsKind, [...(byKind.get(viewsKind) ?? []), views]);
      }
      const dominant = [...byKind].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))[0];
      if (dominant === undefined) expect(c.medianViews, c.handle).toBeUndefined();
      else expect(c.medianViews, c.handle).toBeCloseTo(medianOf(dominant[1]), 0);
      const tiers = own.map((x) => x.score.liftTier).filter((t): t is NonNullable<typeof t> => t !== undefined);
      if (tiers.length === 0) expect(c.outlierCount, c.handle).toBeUndefined();
      else expect(c.outlierCount, c.handle).toBe(tiers.filter((t) => t >= OUTLIER_MIN_TIER).length);
      const dated = own.filter((x) => x.publishedAt !== undefined).length;
      if (dated < 3) expect(c.postsPerWeek, c.handle).toBeUndefined();
      else expect(c.postsPerWeek, c.handle).toBeGreaterThan(0);
      if (c.followersDelta7d !== undefined) expect(Number.isFinite(c.followersDelta7d), c.handle).toBe(true);
      if (own.length === 0) expect([c.medianViews, c.outlierCount, c.postsPerWeek], c.handle).toEqual([undefined, undefined, undefined]);
    }
    expect(competitors.some((c) => c.outlierCount !== undefined && c.medianViews !== undefined && c.postsPerWeek !== undefined)).toBe(true);
    // Süzgeç sonucu aynı istatistiği taşır.
    const tracked = await r.listCompetitors(wsId, { status: "tracked" });
    for (const t of tracked) expect(t.medianViews).toBe(competitors.find((c) => c.id === t.id)?.medianViews);
  });
}
