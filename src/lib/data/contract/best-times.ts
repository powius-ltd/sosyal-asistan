/**
 * Sözleşme parçası: genel bakışın en iyi paylaşım saatleri (`Overview.bestTimes`). Salt okuma; temizlik gerekmez.
 * Ölçülemeyen = undefined + sebep (boş liste ya da 0 değil). Dilimler workspace saat diliminde, gün Pzt = 0.
 */
import { expect, it } from "vitest";

import { BEST_TIMES_LIMIT } from "@/lib/domain/overview";
import { BEST_SLOT_MIN_POSTS, zonedWeekdayHour } from "@/lib/metrics/temporal";
import type { Overview } from "@/lib/domain/overview";
import { expectDescending, type ContractContext } from "@/lib/data/contract/support";

export function bestTimesContract(ctx: ContractContext): void {
  const { wsId, create, allContent } = ctx;

  function expectShape(o: Overview, label: string) {
    if (o.bestTimes === undefined) {
      expect(o.bestTimesUnmeasuredReason?.trim(), `${label}: ölçülemediyse sebep`).toBeTruthy();
      return;
    }
    expect(o.bestTimesUnmeasuredReason, `${label}: ölçüldüyse sebep yok`).toBeUndefined();
    expect(o.bestTimes.length, `${label}: boş liste yerine undefined`).toBeGreaterThan(0);
    expect(o.bestTimes.length).toBeLessThanOrEqual(BEST_TIMES_LIMIT);
    for (const t of o.bestTimes) {
      expect(Number.isInteger(t.weekday) && t.weekday >= 0 && t.weekday <= 6, `${label}: gün 0..6`).toBe(true);
      expect(Number.isInteger(t.hour) && t.hour >= 0 && t.hour <= 23, `${label}: saat 0..23`).toBe(true);
      expect(t.n, `${label}: en az ${BEST_SLOT_MIN_POSTS} paylaşım`).toBeGreaterThanOrEqual(BEST_SLOT_MIN_POSTS);
      if (t.medianViews !== undefined) expect(t.medianViews).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(o.bestTimes.map((t) => `${t.weekday}-${t.hour}`)).size, `${label}: dilimler tekrarsız`).toBe(o.bestTimes.length);
    expectDescending(o.bestTimes.map((t) => t.medianViews), `${label}: medyan izlenme azalan`);
  }

  it("bestTimes: şekil kuralları (genel, hesap ve platform kapsamında); dönem (days) sonucu değiştirmez", async () => {
    const r = create();
    const overall = await r.getOverview(wsId);
    expectShape(overall, "genel");
    for (const days of [1, 7, 90]) {
      const o = await r.getOverview(wsId, { days });
      expect([o.bestTimes, o.bestTimesUnmeasuredReason], `days=${days}`).toEqual([overall.bestTimes, overall.bestTimesUnmeasuredReason]);
    }
    for (const account of await r.listOwnAccounts(wsId)) expectShape(await r.getOverview(wsId, { accountId: account.id }), `hesap ${account.handle}`);
    for (const platform of new Set((await r.listOwnAccounts(wsId)).map((a) => a.platform))) {
      expectShape(await r.getOverview(wsId, { platform }), `platform ${platform}`);
    }
  });

  it("bestTimes: dilim, kendi kısa videolardan (kapsamdaki hesap) hesaplanır — n ve medyan izlenme içerikle tutarlı", async () => {
    const r = create();
    const workspace = await r.getWorkspace(wsId);
    const timeZone = workspace?.timezone;
    expect(timeZone).toBeTruthy();
    const content = await allContent(r, { ownerKind: "own", format: "short_video" });
    for (const account of await r.listOwnAccounts(wsId)) {
      const overview = await r.getOverview(wsId, { accountId: account.id });
      if (!overview.bestTimes) continue;
      const mine = content.filter((c) => c.owner.id === account.id && c.metrics.views !== undefined && c.publishedAt !== undefined);
      for (const slot of overview.bestTimes) {
        const inSlot = mine.filter((c) => {
          const at = zonedWeekdayHour(new Date(c.publishedAt as string), timeZone);
          return at.weekday === slot.weekday && at.hour === slot.hour;
        });
        // Geriye bakış ve olgunluk süzgeci yüzünden dilimdeki tüm videolar sayılmayabilir: n ≤ dilimdeki video sayısı.
        expect(inSlot.length, `${account.handle} ${slot.weekday}-${slot.hour}`).toBeGreaterThanOrEqual(slot.n);
        const views = inSlot.map((c) => c.metrics.views as number);
        if (slot.medianViews !== undefined) {
          expect(slot.medianViews).toBeGreaterThanOrEqual(Math.min(...views));
          expect(slot.medianViews).toBeLessThanOrEqual(Math.max(...views));
        }
      }
    }
  });
}
