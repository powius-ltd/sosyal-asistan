import { describe, expect, it } from "vitest";

import { planRoutine } from "@/lib/orchestrator/plan-routine";
import { actionOf, baseState } from "@/lib/orchestrator/test-support";

const decisionOf = (state: ReturnType<typeof baseState>, step: Parameters<typeof actionOf>[1]) => planRoutine(state).find((e) => e.step === step)?.decision;

describe("planRoutine: Apify onay kapısı", () => {
  it("onay yoksa toplama needs_approval (geçmiş referansla), asla run değil", () => {
    const decision = decisionOf(baseState(), "collect");
    expect(decision).toMatchObject({ action: "needs_approval", estimateUsd: 0.27 });
  });

  it("geçmiş koşu yoksa tahmin undefined (0 değil)", () => {
    const decision = decisionOf(baseState({ collection: { newContentSinceBriefing: 0 } }), "collect");
    expect(decision?.action).toBe("needs_approval");
    expect(decision && "estimateUsd" in decision ? decision.estimateUsd : undefined).toBeUndefined();
  });

  it("onay bekleyen toplamanın nedeni yüzeyden bağımsız: terminal bayrağı ya da komut yazmaz (panelde adım notu olarak da okunur)", () => {
    for (const state of [baseState(), baseState({ collection: { newContentSinceBriefing: 0 } })]) {
      const reason = decisionOf(state, "collect")?.reason ?? "";
      expect(reason).toContain("onayı yok");
      expect(reason).not.toMatch(/--[a-z]|npm run/);
    }
  });

  it("onay varsa run; referans tavanı aşıyorsa sebepte uyarı", () => {
    const decision = decisionOf(baseState({ apifyMaxUsd: 0.2 }), "collect");
    expect(decision?.action).toBe("run");
    expect(decision?.reason).toContain("aşarsa koşu başlamaz");
  });

  it("onay yokken son toplama 24 saatten tazeyse skip (onay sorulmaz)", () => {
    const decision = decisionOf(baseState({ collection: { lastCollectedAt: "2026-10-01T02:00:00.000Z", referenceUsd: 0.27, newContentSinceBriefing: 0 } }), "collect");
    expect(decision?.action).toBe("skip");
  });

  it("açık onay taze toplamayı ezer: run", () => {
    const state = baseState({ apifyMaxUsd: 0.3, collection: { lastCollectedAt: "2026-10-01T08:00:00.000Z", newContentSinceBriefing: 0 } });
    expect(actionOf(planRoutine(state), "collect")).toBe("run");
  });
});

describe("planRoutine: analiz / etiket / plan / ölçüm", () => {
  it("analizsiz seçilebilir video yoksa analiz skip, sayı varsa run", () => {
    expect(actionOf(planRoutine(baseState({ analysis: { selectable: 0 } })), "analyze")).toBe("skip");
    expect(actionOf(planRoutine(baseState()), "analyze")).toBe("run");
  });

  it("etiket: etiketsiz varsa run; yoksa yalnız analiz koşuyorsa run, ikisi de yoksa skip", () => {
    expect(actionOf(planRoutine(baseState()), "label")).toBe("run");
    expect(actionOf(planRoutine(baseState({ labeling: { eligible: 0 } })), "label")).toBe("run"); // analiz koşuyor
    expect(actionOf(planRoutine(baseState({ labeling: { eligible: 0 }, analysis: { selectable: 0 } })), "label")).toBe("skip");
  });

  it("hedef hafta planı varsa plan skip (yeniden üretilmez), yoksa run", () => {
    const skip = decisionOf(baseState({ plan: { exists: true, status: "ready", plannedCount: 4 } }), "plan");
    expect(skip?.action).toBe("skip");
    expect(skip?.reason).toContain("2026-10-05");
    expect(actionOf(planRoutine(baseState()), "plan")).toBe("run");
  });

  it("ölçüm kontrolü her zaman run (ücretsiz); ölçüm koşusu rutinde yok", () => {
    expect(actionOf(planRoutine(baseState({ measurement: { dueCount: 0, capApproved: false } })), "measure_check")).toBe("run");
    const steps = planRoutine(baseState()).map((e) => e.step);
    expect(steps).toEqual(["collect", "analyze", "label", "cluster", "plan", "measure_check", "briefing"]);
  });
});

describe("planRoutine: brifing", () => {
  const quiet = baseState({
    analysis: { selectable: 0 },
    labeling: { eligible: 0 },
    plan: { exists: true, status: "ready", plannedCount: 4 },
    collection: { lastCollectedAt: "2026-10-01T02:00:00.000Z", newContentSinceBriefing: 0 },
    briefing: { generatedAt: "2026-10-01T03:00:00.000Z", freshness: { stale: false } },
  });

  it("brifing yoksa run", () => {
    expect(actionOf(planRoutine({ ...quiet, briefing: {} }), "briefing")).toBe("run");
  });

  it("bayatsa run (sebep yazılır)", () => {
    const decision = decisionOf({ ...quiet, briefing: { generatedAt: "2026-09-01T00:00:00.000Z", freshness: { stale: true, reason: "new_data" } } }, "briefing");
    expect(decision?.action).toBe("run");
    expect(decision?.reason).toContain("bayat");
  });

  it("taze ve rutinde yeni veri yoksa skip", () => {
    expect(actionOf(planRoutine(quiet), "briefing")).toBe("skip");
  });

  it("taze olsa da yeni içerik ya da koşacak veri adımı varsa run", () => {
    expect(actionOf(planRoutine({ ...quiet, collection: { ...quiet.collection, newContentSinceBriefing: 4 } }), "briefing")).toBe("run");
    expect(actionOf(planRoutine({ ...quiet, analysis: { selectable: 5 } }), "briefing")).toBe("run");
  });

  it("yalnız ölçüm kontrolü koşuyorsa brifing taze kalır (skip)", () => {
    expect(actionOf(planRoutine({ ...quiet, measurement: { dueCount: 2, capApproved: true } }), "briefing")).toBe("skip");
  });
});
