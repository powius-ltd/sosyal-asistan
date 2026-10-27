/**
 * Sözleşme parçası: içerik listesi, filtreler, sayfalama ve içerik ayrıntısı.
 */
import { expect, it } from "vitest";

import { liftTierFor, type ContentItem } from "@/lib/domain/content";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type ContentFilter } from "@/lib/data/queries";
import {
  expectDescending,
  idsOf,
  medianOf,
  METRIC_KEYS,
  MISSING_ID,
  ms,
  type ContractContext,
} from "@/lib/data/contract/support";

export function contentContract(ctx: ContractContext): void {
  const { wsId, create, allContent } = ctx;

  it("içerik: skor önbelleği tutarlı, ölçülemeyen alan 0 yazılmamış", async () => {
    for (const c of await allContent(create())) {
      expect(c.workspaceId).toBe(wsId);
      expect(c.score.liftTier, c.id).toBe(liftTierFor(c.score.lift));
      const metrics = c.metrics as unknown as Record<string, unknown>;
      for (const f of c.missingFields.filter((x) => METRIC_KEYS.includes(x))) expect(metrics[f], `${c.id}.${f}`).toBeUndefined();
      if (c.score.baselineN !== undefined) expect(c.score.lowConfidence, c.id).toBe(c.score.baselineN < 10);
      if (c.metrics.views === undefined) expect(c.score.lift, c.id).toBeUndefined();
      if (c.score.lift !== undefined) {
        expect(c.score.baselineViews, c.id).toBeGreaterThan(0);
        expect(c.score.lift, c.id).toBeCloseTo((c.metrics.views as number) / (c.score.baselineViews as number), 1);
        expect(c.score.viewsKind, c.id).toBe(c.metrics.viewsKind);
      }
    }
  });

  it("listContent sayfalama: cursor her kaydı bir kez gezer; limit varsayılanı ve üst sınırı", async () => {
    const r = create();
    const first = await r.listContent(wsId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();
    const ids = (await allContent(r, {}, 7)).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    if (first.total !== undefined) expect(ids.length).toBe(first.total);
    expect((await r.listContent(wsId)).items.length).toBeLessThanOrEqual(DEFAULT_PAGE_LIMIT);
    expect((await r.listContent(wsId, { limit: 10_000 })).items.length).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
  });

  it("listContent filtreleri tam listeyi süzmekle aynı sonucu verir; sıralamalar azalan", async () => {
    const r = create();
    const all = await allContent(r);
    const times = all.map((c) => ms(c.publishedAt)).filter((t): t is number => t !== undefined).sort((a, b) => a - b);
    const since = new Date(times[Math.floor(times.length / 2)]).toISOString();
    const probe = all[0];
    const cases: [ContentFilter, (c: ContentItem) => boolean][] = [
      [{ ownerKind: "own" }, (c) => c.owner.kind === "own"],
      [{ ownerKind: "competitor" }, (c) => c.owner.kind === "competitor"],
      [{ platform: probe.platform }, (c) => c.platform === probe.platform],
      [{ format: probe.format }, (c) => c.format === probe.format],
      [{ ownerId: probe.owner.id }, (c) => c.owner.id === probe.owner.id],
      [{ minTier: 3 }, (c) => (c.score.liftTier ?? -1) >= 3],
      [{ since }, (c) => (ms(c.publishedAt) ?? -Infinity) >= (ms(since) as number)],
      [{ hideLowConfidence: true }, (c) => !c.score.lowConfidence],
      [{ hideImmature: true }, (c) => !c.score.immature],
    ];
    for (const [filter, pred] of cases) {
      expect(idsOf(await allContent(r, filter)), JSON.stringify(filter)).toEqual(idsOf(all.filter(pred)));
    }
    const found = await allContent(r, { search: probe.owner.handle.toUpperCase() });
    expect(found.some((c) => c.id === probe.id)).toBe(true);
    const page = async (f: ContentFilter) => (await r.listContent(wsId, { ...f, limit: MAX_PAGE_LIMIT })).items;
    expectDescending((await page({})).map((c) => ms(c.publishedAt)), "recent");
    expectDescending((await page({ sort: "lift" })).map((c) => c.score.lift), "lift");
    expectDescending((await page({ sort: "views" })).map((c) => c.metrics.views), "views");
  });

  it("getContent: snapshot serisi, baz çizgisi açıklaması ve kanıt alıntıları tutarlı", async () => {
    const r = create();
    const all = await allContent(r);
    const targets = [
      ...all.filter((c) => c.score.lift !== undefined).slice(0, 3),
      ...all.filter((c) => c.metrics.views === undefined).slice(0, 2),
      ...all.filter((c) => c.analysisStatus !== undefined).slice(0, 6),
    ];
    for (const t of targets) {
      const d = await r.getContent(wsId, t.id);
      expect(d?.item.id).toBe(t.id);
      if (!d) continue;
      expect(d.snapshots.every((s) => s.contentItemId === t.id)).toBe(true);
      expect(d.snapshots.map((s) => s.capturedAt)).toEqual(d.snapshots.map((s) => s.capturedAt).sort());
      const b = d.baseline;
      expect([b.format, b.n, b.lowConfidence]).toEqual([t.format, b.basis.length, b.n < 10]);
      expect(b.n).toBeLessThanOrEqual(b.windowSize);
      expect(b.basis.some((x) => x.contentItemId === t.id)).toBe(false);
      // Dışarıda kalan sayaçları: her içerik yalnız İLK takıldığı kuralda sayılır (self → otherFormat → pinned → noViews).
      const others = all.filter((x) => x.owner.id === t.owner.id && x.id !== t.id);
      const sameFormat = others.filter((x) => x.format === t.format);
      expect(Object.values(b.excluded).every((n) => Number.isInteger(n) && n >= 0), t.id).toBe(true);
      expect(b.excluded.self, t.id).toBe(1);
      expect(b.excluded.otherFormat, t.id).toBe(others.length - sameFormat.length);
      expect(b.excluded.pinned, t.id).toBe(sameFormat.filter((x) => x.isPinned === true).length);
      expect(b.excluded.noViews, t.id).toBe(sameFormat.filter((x) => x.isPinned !== true && x.metrics.views === undefined).length);
      const excludedTotal = Object.values(b.excluded).reduce((sum, n) => sum + n, 0);
      expect(excludedTotal + b.n, t.id).toBeLessThanOrEqual(others.length + 1);
      if (b.medianViews !== undefined) expect(medianOf(b.basis.map((x) => x.views))).toBeCloseTo(b.medianViews, 0);
      // Önbellek = açıklama: YALNIZ aynı kayıt için beklenir (getContent'in kendi item'ı ile açıklaması aynı
      // hesaplama anından saklanır); listeden okunan başka bir okumayla karşılaştırılmaz.
      const cached = d.item.score;
      if (cached.baselineViews !== undefined) expect(b.medianViews, t.id).toBeCloseTo(cached.baselineViews, 0);
      if (cached.baselineN !== undefined) expect(b.n, t.id).toBe(cached.baselineN);
      // Lift hesaplanamadıysa (izlenme yok, tür bilinmiyor, baz çizgisi boş ya da medyan 0) açıklama sebebi taşır.
      if (cached.lift === undefined) expect(b.unmeasuredReason, t.id).toBeTruthy();
      else expect(b.unmeasuredReason, t.id).toBeUndefined();
      expect(t.hasTranscript, t.id).toBe(d.transcript !== undefined);
      if (d.transcript) expect(d.transcript.contentItemId).toBe(t.id);
      const a = d.analysis;
      if (!a) continue;
      expect([a.contentItemId, a.status]).toEqual([t.id, t.analysisStatus]);
      if (a.status !== "ok") expect(a.evidenceVerified, a.id).toBe(false);
      const text = d.transcript?.text;
      if (a.status !== "ok" || !a.evidenceVerified || !text) continue;
      const quotes = [a.hookText, a.hookTypeEvidence, ...a.sections.map((s) => s.quote), ...a.labels.map((l) => l.evidence)];
      for (const q of quotes.filter((x): x is string => x !== undefined)) expect(text.includes(q), `${a.id}: "${q}"`).toBe(true);
    }
    expect(await r.getContent(wsId, MISSING_ID)).toBeNull();
  });
}
