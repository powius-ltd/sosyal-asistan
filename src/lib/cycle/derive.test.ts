import { describe, expect, it } from "vitest";

import { deriveCycle } from "@/lib/cycle/derive";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { cycleStateSchema } from "@/lib/cycle/schema";
import { CYCLE_STATUSES, CYCLE_STEP_IDS, type CycleFacts, type CycleStepId } from "@/lib/cycle/types";
import { formatCycleState } from "@/lib/cycle/format";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** Her şeyi yapılmış, taze bir hesap; testler tek alanı bozar. */
const fresh = (overrides: Partial<CycleFacts> = {}): CycleFacts => ({
  workspaceId: "ws-1",
  accountType: "business",
  ownAccounts: 1,
  trackedRivals: 2,
  contentCount: 30,
  lastCollectedAt: daysAgo(2),
  pendingAnalysis: 0,
  analyzedCount: 30,
  pendingLabels: 0,
  nextWeekPlan: true,
  thisWeekPlan: true,
  ownContentCount: 10,
  lastMeasuredAt: daysAgo(0),
  zernioKey: true,
  jobs: [],
  nextWeekStart: "2026-10-26",
  ...overrides,
});

const statusOf = (facts: CycleFacts, id: CycleStepId) => deriveCycle(facts, NOW).steps.find((step) => step.id === id)?.status;

describe("deriveCycle", () => {
  it("taze hesap: kodu olan her adım done (yayın dahil), kodu olmayanlar not_built, sıradaki adım yok", () => {
    const state = deriveCycle(fresh(), NOW);
    expect(state.steps.map((s) => s.id)).toEqual([...CYCLE_STEP_IDS]);
    expect(Object.fromEntries(state.steps.map((s) => [s.id, s.status]))).toEqual({
      account: "done", rivals: "done", collect: "done", analyze: "done", label: "done", plan: "done", slip: "not_built", share: "done", measure: "done", learn: "not_built",
    });
    expect(state.next).toBeUndefined();
    expect(() => cycleStateSchema.parse(state)).not.toThrow();
  });

  it("her durum en az bir adımda görülür (done, due, needs_approval, blocked, not_built)", () => {
    const seen = new Set<string>();
    for (const facts of [fresh(), fresh({ pendingAnalysis: 5 }), fresh({ lastCollectedAt: daysAgo(10) }), fresh({ contentCount: 0, lastCollectedAt: undefined, analyzedCount: 0 })]) {
      for (const step of deriveCycle(facts, NOW).steps) seen.add(step.status);
    }
    expect([...seen].sort()).toEqual([...CYCLE_STATUSES].sort());
  });

  it("hesap yoksa account due (onboarding), rakip ve toplama engelli", () => {
    const facts = fresh({ ownAccounts: 0, trackedRivals: 0 });
    expect(statusOf(facts, "account")).toBe("due");
    expect(statusOf(facts, "rivals")).toBe("blocked");
    expect(statusOf(facts, "collect")).toBe("blocked");
    expect(deriveCycle(facts, NOW).next).toBe("account");
  });

  it("rakip yok: business için para harcayan keşif (needs_approval), creator için done", () => {
    expect(statusOf(fresh({ trackedRivals: 0 }), "rivals")).toBe("needs_approval");
    expect(deriveCycle(fresh({ trackedRivals: 0 }), NOW).steps[1].jobKind).toBe("discover");
    expect(statusOf(fresh({ trackedRivals: 0, accountType: "creator" }), "rivals")).toBe("done");
  });

  it("toplama tazeliği eşikte: eşik günü done, bir gün fazlası needs_approval, hiç toplanmamış needs_approval", () => {
    expect(statusOf(fresh({ lastCollectedAt: daysAgo(CYCLE_RULES.collectFreshDays) }), "collect")).toBe("done");
    expect(statusOf(fresh({ lastCollectedAt: daysAgo(CYCLE_RULES.collectFreshDays + 1) }), "collect")).toBe("needs_approval");
    expect(statusOf(fresh({ lastCollectedAt: undefined, contentCount: 0 }), "collect")).toBe("needs_approval");
  });

  it("inceleme ve etiket: bekleyen varsa due; içerik yoksa engelli; creator'da etiket uygulanmaz", () => {
    expect(statusOf(fresh({ pendingAnalysis: 3 }), "analyze")).toBe("due");
    expect(statusOf(fresh({ contentCount: 0, analyzedCount: 0 }), "analyze")).toBe("blocked");
    expect(statusOf(fresh({ pendingLabels: 2 }), "label")).toBe("due");
    expect(statusOf(fresh({ pendingLabels: 2, accountType: "creator" }), "label")).toBe("done");
    expect(statusOf(fresh({ analyzedCount: 0, pendingLabels: 0 }), "label")).toBe("blocked");
  });

  it("plan: gelecek haftanın planı yoksa due; incelenmiş içerik yoksa engelli", () => {
    expect(statusOf(fresh({ nextWeekPlan: false }), "plan")).toBe("due");
    expect(statusOf(fresh({ nextWeekPlan: false, analyzedCount: 0 }), "plan")).toBe("blocked");
  });

  it("ölçüm: eski ölçüm due (measure_zernio), anahtarsız engelli, paylaşım yoksa engelli", () => {
    expect(statusOf(fresh({ lastMeasuredAt: daysAgo(CYCLE_RULES.measureFreshDays) }), "measure")).toBe("due");
    expect(statusOf(fresh({ lastMeasuredAt: undefined }), "measure")).toBe("due");
    expect(statusOf(fresh({ zernioKey: false }), "measure")).toBe("blocked");
    expect(statusOf(fresh({ ownContentCount: 0 }), "measure")).toBe("blocked");
  });

  it("sıradaki adım ilk due / needs_approval olandır; son iş ve çalışan iş nedene yansır", () => {
    const state = deriveCycle(fresh({ pendingAnalysis: 1, nextWeekPlan: false, jobs: [{ kind: "analyze", status: "running" }, { kind: "routine", status: "succeeded", finishedAt: daysAgo(1) }] }), NOW);
    expect(state.next).toBe("analyze");
    const analyze = state.steps.find((s) => s.id === "analyze");
    expect(analyze?.lastJob).toMatchObject({ kind: "analyze", status: "running" });
    expect(analyze?.reason).toContain("iş sürüyor");
  });

  it("insan okuyabilir döküm her adımı ve sıradaki adımı yazar", () => {
    const lines = formatCycleState(deriveCycle(fresh({ pendingAnalysis: 1 }), NOW));
    expect(lines).toHaveLength(CYCLE_STEP_IDS.length + 1);
    expect(lines.at(-1)).toContain("analyze");
  });
});

describe("deriveCycle · yayın adımı (share)", () => {
  const q = (publishQueue: NonNullable<CycleFacts["publishQueue"]>) => fresh({ publishQueue });
  const step = (facts: CycleFacts) => deriveCycle(facts, NOW).steps.find((s) => s.id === "share");

  it("onaylı satır varsa publish due; dönen fiş varsa order_return due; yalnız onay bekleyen varsa blocked (zincir onaylamaz)", () => {
    expect(step(q({ returnable: 0, awaitingApproval: 0, dueForPublish: 2, approved: 2 }))).toMatchObject({ status: "due", jobKind: "publish" });
    expect(step(q({ returnable: 1, awaitingApproval: 0, dueForPublish: 0, approved: 0 }))).toMatchObject({ status: "due", jobKind: "order_return" });
    expect(step(q({ returnable: 0, awaitingApproval: 3, dueForPublish: 0, approved: 0 }))).toMatchObject({ status: "blocked" });
    expect(step(q({ returnable: 0, awaitingApproval: 0, dueForPublish: 0, approved: 0 }))?.status).toBe("done");
    expect(deriveCycle(q({ returnable: 0, awaitingApproval: 3, dueForPublish: 0, approved: 0 }), NOW).next).toBeUndefined();
  });

  it("onaylı satır önce gelir (order_return'dan)", () => {
    expect(step(q({ returnable: 4, awaitingApproval: 1, dueForPublish: 1, approved: 1 }))?.jobKind).toBe("publish");
  });
});
