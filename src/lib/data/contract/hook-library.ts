/**
 * Sözleşme parçası: hook kütüphanesi (analizlerden türetilen görünüm; yazma yok, temizlik gerekmez).
 * Seed gereksinimi: ≥1 `ok` + kanıtı doğrulanmış analiz (kendi ya da izlenen rakip içeriği).
 */
import { expect, it } from "vitest";

import { liftTierFor } from "@/lib/domain/content";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { HookLibraryEntry } from "@/lib/domain/hook-library";
import { PLATFORMS } from "@/lib/domain/platform";
import { MAX_PAGE_LIMIT, type HookLibraryFilter } from "@/lib/data/queries";
import type { PanelRepository } from "@/lib/data/repository";
import { expectDescending, medianOf, ms, type ContractContext } from "@/lib/data/contract/support";

export function hookLibraryContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  async function all(r: PanelRepository, filter: HookLibraryFilter = {}): Promise<HookLibraryEntry[]> {
    const out: HookLibraryEntry[] = [];
    for (let page = 0, cursor: string | undefined = undefined; page < 200; page++) {
      const res = await r.listHookLibrary(wsId, { ...filter, limit: 7, cursor });
      out.push(...res.items);
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  it("girişler: yalnız ok + doğrulanmış analiz; alanlar içerikle tutarlı; hook transcript'ten birebir; yalnız kendi ya da izlenen rakip", async () => {
    const r = create();
    const entries = await all(r);
    expect(entries.length, "seed: en az bir hook").toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.contentId)).size, "içerik başına en çok bir giriş").toBe(entries.length);
    const tracked = new Set((await r.listCompetitors(wsId, { status: "tracked" })).map((c) => c.id));

    for (const e of entries) {
      expect(e.hookText.trim(), e.contentId).toBeTruthy();
      expect(e.hookType.trim(), e.contentId).toBeTruthy();
      expect(PLATFORMS, e.contentId).toContain(e.platform);
      const detail = await r.getContent(wsId, e.contentId);
      if (!detail?.analysis) throw new Error(`giriş için analiz yok: ${e.contentId}`);
      const { item, analysis, transcript } = detail;
      expect([analysis.status, analysis.evidenceVerified], `${e.contentId}: yalnız ok + doğrulanmış`).toEqual(["ok", true]);
      expect([e.hookText, e.hookType, e.hookTypeEvidence]).toEqual([analysis.hookText, analysis.hookType, analysis.hookTypeEvidence]);
      expect([e.ownerHandle, e.platform, e.publishedAt, e.isOwn]).toEqual([item.owner.handle, item.platform, item.publishedAt, item.owner.kind === "own"]);
      expect([e.lift, e.liftTier], `${e.contentId}: lift/kademe içerikle aynı`).toEqual([item.score.lift, item.score.liftTier]);
      if (e.lift !== undefined) expect(e.liftTier, e.contentId).toBe(liftTierFor(e.lift));
      else expect([e.lift, e.liftTier], "ölçülemeyen lift 0 yazılmaz").toEqual([undefined, undefined]);
      expect(e.language, e.contentId).toBe(transcript?.language);
      if (transcript?.text) expect(transcript.text.includes(e.hookText), `${e.contentId}: hook birebir alıntı`).toBe(true);
      if (!e.isOwn) expect(tracked.has(item.owner.id), `${e.contentId}: yalnız izlenen rakip`).toBe(true);
    }
  });

  it("filtreler (hookType, minTier, own, q) uygulanır; toplam ve sayfalama tutarlı", async () => {
    const r = create();
    const entries = await all(r);
    const probe = entries[0];
    const cases: [HookLibraryFilter, (e: HookLibraryEntry) => boolean][] = [
      [{ hookType: probe.hookType }, (e) => e.hookType === probe.hookType],
      [{ minTier: 3 }, (e) => (e.liftTier ?? -1) >= 3],
      [{ minTier: 1 }, (e) => (e.liftTier ?? -1) >= 1],
      [{ own: true }, (e) => e.isOwn],
      [{ own: false }, (e) => !e.isOwn],
      [{ q: probe.hookText.slice(0, 12).toUpperCase() }, (e) => e.hookText.toLocaleLowerCase("tr-TR").includes(probe.hookText.slice(0, 12).toLocaleLowerCase("tr-TR"))],
      [{ q: probe.ownerHandle.toUpperCase() }, (e) => e.ownerHandle === probe.ownerHandle],
      [{ q: hookTypeLabel(probe.hookType).toLocaleUpperCase("tr-TR") }, (e) => e.hookType === probe.hookType],
      [{ hookType: probe.hookType, own: probe.isOwn, minTier: 0 }, (e) => e.hookType === probe.hookType && e.isOwn === probe.isOwn && e.liftTier !== undefined],
    ];
    for (const [filter, predicate] of cases) {
      const got = (await all(r, filter)).map((e) => e.contentId).sort();
      // q dalları hook metni/etiketi/hesap üzerinden çoklu eşleşebilir: alt küme değil, birebir beklenen yalnız net filtrelerde.
      const expected = entries.filter(predicate).map((e) => e.contentId).sort();
      if ("q" in filter) expect(got, JSON.stringify(filter)).toEqual(expect.arrayContaining([probe.contentId]));
      else expect(got, JSON.stringify(filter)).toEqual(expected);
      const first = await r.listHookLibrary(wsId, { ...filter, limit: 3 });
      expect(first.total, JSON.stringify(filter)).toBe(got.length);
      expect(first.items.length).toBeLessThanOrEqual(3);
    }
    expect((await r.listHookLibrary(wsId, { hookType: "olmayan_tur" })).items).toEqual([]);
    expect((await r.listHookLibrary(wsId, { q: "   " })).total, "boş arama süzmez").toBe(entries.length);
    expect((await r.listHookLibrary(wsId, { limit: MAX_PAGE_LIMIT * 5 })).items.length, "limit üst sınırla kırpılır").toBeLessThanOrEqual(MAX_PAGE_LIMIT);
  });

  it("sıralama: lift azalan (varsayılan; ölçülemeyen sonda) ve recent (yayın tarihi azalan)", async () => {
    const r = create();
    const byLift = await all(r, { sort: "lift" });
    expectDescending(byLift.map((e) => e.lift), "lift");
    expect((await all(r)).map((e) => e.contentId), "varsayılan = lift").toEqual(byLift.map((e) => e.contentId));
    expectDescending((await all(r, { sort: "recent" })).map((e) => ms(e.publishedAt)), "recent");
  });

  it("hookTypeStats: tür başına sayı ve medyan lift kütüphaneyle tutarlı; ölçülemeyen undefined; sıralama deterministik", async () => {
    const r = create();
    const entries = await all(r);
    const stats = await r.hookTypeStats(wsId);
    expect(new Set(stats.map((s) => s.hookType)).size, "tür başına tek satır").toBe(stats.length);
    expect(stats.reduce((sum, s) => sum + s.count, 0)).toBe(entries.length);
    for (const s of stats) {
      const group = entries.filter((e) => e.hookType === s.hookType);
      expect(s.count, s.hookType).toBe(group.length);
      const lifts = group.flatMap((e) => (e.lift === undefined ? [] : [e.lift]));
      if (lifts.length === 0) expect(s.medianLift, `${s.hookType}: lift yoksa 0 değil undefined`).toBeUndefined();
      else expect(s.medianLift, s.hookType).toBeCloseTo(medianOf(lifts), 9);
    }
    expectDescending(stats.map((s) => s.medianLift), "medyan lift");
    expect(await r.hookTypeStats(wsId), "aynı okuma aynı sonuç").toEqual(stats);
  });

  it("bilinmeyen workspace: boş sonuç", async () => {
    const r = create();
    expect(await r.listHookLibrary(foreign)).toEqual({ items: [], total: 0 });
    expect(await r.hookTypeStats(foreign)).toEqual([]);
  });
}
