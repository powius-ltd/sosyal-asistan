/**
 * Rutin karar tablosu: etiket ve kümele adımları hesap türüne göre. Tür tek yerde (`account-type` profili) dallanır; karar fonksiyonu saf.
 */
import { describe, expect, it } from "vitest";

import type { AccountType } from "@/lib/domain/account-type";
import { planRoutine } from "@/lib/orchestrator/plan-routine";
import { baseState } from "@/lib/orchestrator/test-support";
import type { RoutineState, RoutineStepId, StepDecision } from "@/lib/orchestrator/types";

const stateOf = (accountType: AccountType, over: Partial<RoutineState> = {}) => baseState({ accountType, ...over });
const decision = (state: RoutineState, step: RoutineStepId): StepDecision => {
  const entry = planRoutine(state).find((e) => e.step === step);
  if (entry === undefined) throw new Error(`adım yok: ${step}`);
  return entry.decision;
};

describe("etiket adımı hesap türüne göre", () => {
  it("creator: etiketlenecek video olsa da atlanır, neden hesap türü; business ve mixed: koşar", () => {
    const creator = decision(stateOf("creator"), "label");
    expect(creator.action).toBe("skip");
    expect(creator.reason).toContain("İçerik üreticisi");
    expect(creator.reason).toContain("etiketlemesi uygulanmaz");
    expect(decision(stateOf("business"), "label").action).toBe("run");
    expect(decision(stateOf("mixed"), "label").action).toBe("run");
  });

  it("creator: yeni analiz koşsa bile etiket atlanır", () => {
    expect(decision(stateOf("creator", { analysis: { selectable: 40 } }), "label").action).toBe("skip");
  });
});

describe("kümele adımı hesap türüne göre ve durumdan", () => {
  it("business: konu matrisi kullanılmaz → atlanır (kümeler olmasa da)", () => {
    const d = decision(stateOf("business", { clustering: { available: true, clusteredCount: 0, unclusteredCount: 5 } }), "cluster");
    expect(d.action).toBe("skip");
    expect(d.reason).toContain("konu × hook matrisi kullanılmaz");
  });

  it("creator: bağlı değilse atlanır (sebep yazılır); bağlıysa durumdan karar verir", () => {
    const unwired = decision(stateOf("creator", { clustering: { available: false, clusteredCount: 0, unclusteredCount: 0 } }), "cluster");
    expect(unwired.action).toBe("skip");
    expect(unwired.reason).toContain("henüz bağlı değil");

    expect(decision(stateOf("creator", { clustering: { available: true, clusteredCount: 0, unclusteredCount: 9 } }), "cluster").reason).toContain("Konu kümesi yok");
    expect(decision(stateOf("creator", { clustering: { available: true, clusteredCount: 20, unclusteredCount: 3 } }), "cluster").reason).toContain("3 analizli video kümesiz");
    // kümeler var, kümesiz video yok: yeni analiz geliyorsa yenilenir, gelmiyorsa atlanır
    const settled = { clustering: { available: true, clusteredCount: 20, unclusteredCount: 0 } };
    expect(decision(stateOf("creator", { ...settled, analysis: { selectable: 12 } }), "cluster").action).toBe("run");
    const idle = decision(stateOf("creator", { ...settled, analysis: { selectable: 0 } }), "cluster");
    expect(idle.action).toBe("skip");
    expect(idle.reason).toContain("güncel");
  });

  it("mixed: kümele de koşar (iki matris); küme sayısı okunamıyorsa (undefined) koşar, 0 sayılmaz", () => {
    expect(decision(stateOf("mixed", { clustering: { available: true, clusteredCount: 0 } }), "cluster").action).toBe("run");
    const unknown = decision(stateOf("creator", { clustering: { available: true }, analysis: { selectable: 0 } }), "cluster");
    expect(unknown.action).toBe("run");
    expect(unknown.reason).toContain("okunamadı");
  });

  it("adım sırası: etiket → kümele → plan; brifing kümele koşacaksa yenilenir ve en sonda kalır", () => {
    const quiet = stateOf("creator", {
      analysis: { selectable: 0 },
      plan: { exists: true, status: "ready", plannedCount: 4 },
      collection: { lastCollectedAt: "2026-10-01T02:00:00.000Z", newContentSinceBriefing: 0 },
      briefing: { generatedAt: "2026-10-01T03:00:00.000Z", freshness: { stale: false } },
      clustering: { available: true, clusteredCount: 20, unclusteredCount: 0 },
    });
    expect(decision(quiet, "briefing").action).toBe("skip");
    const withClusterWork = { ...quiet, clustering: { available: true, clusteredCount: 20, unclusteredCount: 4 } };
    expect(decision(withClusterWork, "briefing").action).toBe("run");
    const order = planRoutine(withClusterWork).map((e) => e.step);
    expect(order.at(-1)).toBe("briefing");
    expect(order.indexOf("label")).toBeLessThan(order.indexOf("cluster"));
    expect(order.indexOf("cluster")).toBeLessThan(order.indexOf("plan"));
  });
});
