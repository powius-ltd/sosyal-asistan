/**
 * Mock veri kümesi — Faz 2 zeka katmanı alanları: yeni (agy) analiz alanları (hook kanalı, kurgu ölçümleri, alıntı denetim
 * raporu, arka uç, koşu), konu eleği sonuçları ve planın niş dışı/alıntı davranışı. Ekranlar bu alanları mock'ta gösterebilmeli.
 */
import { describe, expect, it } from "vitest";

import { HOOK_SOURCES } from "@/lib/domain/intel";
import { buildMockDataset } from "@/lib/data/mock/generators/dataset";
import { LEGACY_FROM, TRANSCRIPT_TARGET } from "@/lib/data/mock/generators/intel";
import { createClock } from "@/lib/data/mock/mock-clock";

const data = buildMockDataset(createClock());
const textOf = (contentItemId: string) => data.transcripts.find((t) => t.contentItemId === contentItemId)?.text ?? "";
const modern = data.analyses.filter((a) => a.backend === "agy");
const legacy = data.analyses.filter((a) => a.backend === undefined);

describe("mock analizler: yeni (agy) ve eski (Faz 1) biçim", () => {
  it(`ilk ${LEGACY_FROM} analiz agy biçiminde, kalanı eski: eski analizde yeni alanların hiçbiri yok`, () => {
    expect(modern).toHaveLength(LEGACY_FROM);
    expect(legacy).toHaveLength(TRANSCRIPT_TARGET - LEGACY_FROM);
    for (const a of legacy) expect([a.hookSource, a.editMetrics, a.evidenceReport, a.runId], a.id).toEqual([undefined, undefined, undefined, undefined]);
    for (const a of modern) {
      expect(a.taxonomyVersion, a.id).toBe("2026-10-v1");
      expect(a.model, a.id).toBe("gemini-3.8-flash-medium");
    }
  });

  it("durum dağılımı yeni biçimde de var: ok + doğrulanmış, ok ama doğrulanamamış, yetersiz veri, başarısız", () => {
    expect(modern.some((a) => a.status === "ok" && a.evidenceVerified)).toBe(true);
    expect(modern.some((a) => a.status === "ok" && !a.evidenceVerified)).toBe(true);
    expect(modern.some((a) => a.status === "insufficient_data")).toBe(true);
    expect(modern.some((a) => a.status === "failed")).toBe(true);
  });

  it("ok analizde hook kanalı dolu (konuşma çoğunlukta); başarısız/yetersiz analizde hook kanalı yok", () => {
    const ok = modern.filter((a) => a.status === "ok");
    for (const a of ok) expect(HOOK_SOURCES, a.id).toContain(a.hookSource);
    expect(ok.filter((a) => a.hookSource === "speech").length).toBeGreaterThan(ok.length / 2);
    expect(new Set(ok.map((a) => a.hookSource)).size, "konuşma dışı kanal da örneklenir").toBeGreaterThan(1);
    for (const a of modern.filter((x) => x.status !== "ok")) expect(a.hookSource, a.id).toBeUndefined();
  });

  it("alıntı denetim raporu evidenceVerified ile AYNI denetimden: verified eşit, başarısızlar failures'ta, checked = passed + failures", () => {
    for (const a of modern.filter((x) => x.status === "ok")) {
      const report = a.evidenceReport;
      if (!report) throw new Error(`${a.id}: rapor yok`);
      expect(report.verified, a.id).toBe(a.evidenceVerified);
      expect(report.checked, a.id).toBe(report.passed + report.failures.length);
      expect(report.insufficientData, a.id).toBe(false);
      expect(report.failures.every((f) => !f.found && f.failure === "not_found" && !textOf(a.contentItemId).includes(f.quote)), a.id).toBe(true);
      // Hook doğrulandıysa kanalı hook kanalıdır; doğrulanamadıysa kanal yok.
      expect(report.hookChannel, a.id).toBe(report.failures.some((f) => f.target === "hook") ? undefined : a.hookSource);
    }
    expect(modern.some((a) => a.status === "ok" && !a.evidenceVerified && (a.evidenceReport?.failures.length ?? 0) > 0), "doğrulanamayan alıntı ayrıntılı görünür").toBe(true);
    for (const a of modern.filter((x) => x.status === "insufficient_data")) expect(a.evidenceReport).toMatchObject({ verified: false, insufficientData: true, checked: 0, failures: [] });
    for (const a of modern.filter((x) => x.status === "failed")) expect(a.evidenceReport, `${a.id}: denetim hiç yapılmadı`).toBeUndefined();
  });

  it("kurgu ölçümleri: bir kısmı ölçülemez (undefined), bir kısmı yalnız görsel/ses özellikleri, bir kısmı tam; değerler tutarlı", () => {
    const ok = modern.filter((a) => a.status === "ok");
    const full = ok.filter((a) => a.editMetrics?.cutCount !== undefined);
    const partial = ok.filter((a) => a.editMetrics !== undefined && a.editMetrics.cutCount === undefined);
    expect(ok.some((a) => a.editMetrics === undefined), "ölçülemeyen = undefined").toBe(true);
    expect(partial.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(ok.length / 2);
    for (const a of partial) expect([a.editMetrics?.avgShotSec, a.editMetrics?.cutsPerMinute, a.editMetrics?.tempo], `${a.id}: kesme yoksa tempo da ölçülmemiş`).toEqual([undefined, undefined, undefined]);
    const items = new Map(data.content.map((c) => [c.id, c]));
    for (const a of full) {
      const m = a.editMetrics;
      const dur = items.get(a.contentItemId)?.durationSec ?? 0;
      expect(m?.cutCount, a.id).toBeGreaterThan(0);
      expect(m?.cutsPerMinute, a.id).toBeCloseTo(((m?.cutCount ?? 0) / dur) * 60, 0);
      expect(["slow", "medium", "fast"], a.id).toContain(m?.tempo);
    }
    for (const a of [...modern.filter((x) => x.status !== "ok"), ...legacy]) expect(a.editMetrics, a.id).toBeUndefined();
  });

  it("yeni analizler abonelik koşusuna bağlı (agy video analizi, billing subscription)", () => {
    const run = data.runs.find((r) => r.id === modern[0].runId);
    expect(run).toMatchObject({ kind: "video_analysis", billing: "subscription", provider: "gemini" });
    expect(modern.every((a) => a.runId === run?.id)).toBe(true);
  });
});

describe("mock konu eleği", () => {
  const screens = data.topicScreens;
  const off = screens.filter((s) => !s.inNiche);
  const items = new Map(data.content.map((c) => [c.id, c]));

  it("içerik başına tek sonuç; alan sınırları DB ile aynı (topic ≤ 80, reason ≤ 300, sürüm dolu)", () => {
    expect(new Set(screens.map((s) => s.contentItemId)).size).toBe(screens.length);
    for (const s of screens) {
      expect(items.has(s.contentItemId), s.contentItemId).toBe(true);
      expect(Array.from(s.topic ?? "").length, s.contentItemId).toBeLessThanOrEqual(80);
      expect(Array.from(s.reason ?? "").length, s.contentItemId).toBeLessThanOrEqual(300);
      expect(s.promptVersion.trim(), s.contentItemId).not.toBe("");
    }
  });

  it("analiz edilen her içerik niş içi elenmiş; niş dışı birkaç rakip videosu analiz edilmemiş (elenen içerik analiz kuyruğuna girmez)", () => {
    const analyzed = new Set(data.analyses.map((a) => a.contentItemId));
    for (const id of analyzed) expect(screens.find((s) => s.contentItemId === id)?.inNiche, id).toBe(true);
    expect(off.length).toBeGreaterThanOrEqual(2);
    for (const s of off) {
      const item = items.get(s.contentItemId);
      expect([item?.owner.kind, item?.format, analyzed.has(s.contentItemId)], s.contentItemId).toEqual(["competitor", "short_video", false]);
    }
    expect(new Set(off.map((s) => items.get(s.contentItemId)?.owner.handle)).size, "tek rakip (evelyn benzeri)").toBe(1);
  });
});

describe("mock haftalık plan: niş dışı + yön alıntısı", () => {
  const plan = data.weeklyPlans[0];
  const off = new Set(data.topicScreens.filter((s) => !s.inNiche).map((s) => s.contentItemId));

  it("niş dışı içerik tutan ve yön kanıtı olamaz; Kaçın'da sahibine göre özetlenir", () => {
    const winnerIds = [...plan.sections.winners.rivals, ...plan.sections.winners.own].map((w) => w.contentItemId);
    const evidenceIds = plan.sections.focus.directions.flatMap((d) => d.evidenceContentIds);
    for (const id of [...winnerIds, ...evidenceIds]) expect(off.has(id), id).toBe(false);
    const entry = plan.sections.avoid.entries.find((e) => e.kind === "off_niche");
    expect(entry).toMatchObject({ group: "off_niche", value: "girisimci.ai", label: "@girisimci.ai", sampleSize: off.size });
    expect(entry?.reason).toContain("niş dışı");
  });

  it("yön gerekçesinin alıntısı: kanıt içeriklerinden birinin, ok + doğrulanmış analizdeki hook'u (kalıcı kısa alıntı)", () => {
    const analysisById = new Map(data.analyses.map((a) => [a.contentItemId, a]));
    const withQuote = plan.sections.focus.directions.filter((d) => d.rationaleQuote !== undefined);
    expect(withQuote.length).toBeGreaterThan(0);
    for (const d of withQuote) {
      const quote = d.rationaleQuote;
      expect(d.evidenceContentIds, d.value).toContain(quote?.contentItemId);
      const analysis = analysisById.get(quote?.contentItemId ?? "");
      expect([analysis?.status, analysis?.evidenceVerified], d.value).toEqual(["ok", true]);
      expect(analysis?.hookText?.startsWith(quote?.text ?? "∅"), d.value).toBe(true);
      expect(Array.from(quote?.text ?? "").length).toBeLessThanOrEqual(200);
      expect(d.rationale, "gerekçe metni alıntıyı içermez (yapısal alanda durur)").not.toContain(quote?.text ?? "∅");
    }
  });
});
