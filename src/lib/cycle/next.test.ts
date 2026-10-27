import { describe, expect, it } from "vitest";

import { CHAIN_JOB_KINDS, CHAIN_STEP_KINDS, isChainSafeKind } from "@/lib/cycle/chain";
import { deriveCycle } from "@/lib/cycle/derive";
import { noProgressKinds } from "@/lib/cycle/no-progress";
import { nextCycleStep, type ChainDecision } from "@/lib/cycle/next";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { CYCLE_STEP_IDS, type CycleFacts, type CycleLastJob } from "@/lib/cycle/types";
import { JOB_KINDS, JOB_KIND_SPEC } from "@/lib/domain/panel-job";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const fresh = (overrides: Partial<CycleFacts> = {}): CycleFacts => ({
  workspaceId: "ws-1", accountType: "business", ownAccounts: 1, trackedRivals: 2, contentCount: 30, lastCollectedAt: daysAgo(2), pendingAnalysis: 0,
  analyzedCount: 30, pendingLabels: 0, nextWeekPlan: true, thisWeekPlan: true, ownContentCount: 10, lastMeasuredAt: daysAgo(0), zernioKey: true, jobs: [], nextWeekStart: "2026-10-26",
  ...overrides,
});

const decide = (facts: CycleFacts, extra: { chainJobsToday?: number; slipWeek?: string } = {}): ChainDecision =>
  nextCycleStep(deriveCycle(facts, NOW), { jobs: facts.jobs, chainJobsToday: extra.chainJobsToday ?? 0, skipKinds: noProgressKinds(facts.jobs, facts.publishQueue, NOW), ...(extra.slipWeek === undefined ? {} : { slipWeek: extra.slipWeek }) });

const job = (kind: CycleLastJob["kind"], status: CycleLastJob["status"]): CycleLastJob => ({ kind, status, finishedAt: daysAgo(0) });

describe("zincir tablosu", () => {
  it("yalnız $0 türleri içerir; para harcayan tür tabloda yok", () => {
    for (const kind of CHAIN_JOB_KINDS) expect(JOB_KIND_SPEC[kind].spend).toBe("never");
    for (const kind of JOB_KINDS.filter((k) => JOB_KIND_SPEC[k].spend !== "never")) expect(isChainSafeKind(kind)).toBe(false);
  });
});

describe("nextCycleStep · para kapısı", () => {
  it("hiçbir durumda para harcayan iş açmaz (olgu kombinasyonları taranır)", () => {
    const variants: Partial<CycleFacts>[] = [];
    for (const ownAccounts of [0, 1]) for (const trackedRivals of [0, 2]) for (const lastCollectedAt of [undefined, daysAgo(2), daysAgo(30)]) {
      for (const pendingAnalysis of [0, 4]) for (const nextWeekPlan of [false, true]) for (const accountType of ["business", "creator", "mixed"] as const) {
        variants.push({ ownAccounts, trackedRivals, lastCollectedAt, contentCount: lastCollectedAt === undefined ? 0 : 30, pendingAnalysis, nextWeekPlan, accountType });
      }
    }
    let requests = 0;
    for (const variant of variants) {
      const decision = decide(fresh(variant), { slipWeek: "2026-10-26" });
      if ("request" in decision) {
        requests += 1;
        expect(JOB_KIND_SPEC[decision.request.kind].spend).toBe("never");
        expect(CHAIN_JOB_KINDS).toContain(decision.request.kind);
      }
    }
    expect(requests).toBeGreaterThan(0);
  });

  it("toplama bayatsa durur ve onay ister (bildirimli); analiz açmaz", () => {
    const decision = decide(fresh({ lastCollectedAt: daysAgo(10), pendingAnalysis: 3 }));
    expect(decision).toEqual({ stop: { reason: "needs_approval", step: "collect", notify: true } });
  });

  it("rakipsiz business hesapta keşif para harcar: durur", () => {
    expect(decide(fresh({ trackedRivals: 0 }))).toEqual({ stop: { reason: "needs_approval", step: "rivals", notify: true } });
  });
});

describe("nextCycleStep · sıra", () => {
  it("analiz → etiket → plan sırasıyla açılır (her çağrıda ilk bekleyen)", () => {
    expect(decide(fresh({ pendingAnalysis: 2, pendingLabels: 2, nextWeekPlan: false }))).toEqual({ request: { kind: "analyze" } });
    expect(decide(fresh({ pendingLabels: 2, nextWeekPlan: false }))).toEqual({ request: { kind: "label" } });
    expect(decide(fresh({ nextWeekPlan: false }))).toEqual({ request: { kind: "plan" } });
  });

  it("plan tamamsa ve fiş bekliyorsa order haftayla açılır; fiş yoksa tamam", () => {
    expect(decide(fresh(), { slipWeek: "2026-10-26" })).toEqual({ request: { kind: "order", week: "2026-10-26" } });
    expect(decide(fresh())).toEqual({ stop: { reason: "complete", notify: false } });
  });

  it("ölçüm eskiyse measure_zernio açılır", () => {
    expect(decide(fresh({ lastMeasuredAt: daysAgo(3) }))).toEqual({ request: { kind: "measure_zernio" } });
  });

  it("zincir tablosundaki her adım halka adımıdır", () => {
    for (const id of Object.keys(CHAIN_STEP_KINDS)) expect(CYCLE_STEP_IDS).toContain(id);
  });
});

describe("nextCycleStep · frenler", () => {
  it("başarısız ya da durmuş son iş → durur ve bildirir; sessiz yeniden deneme yok", () => {
    for (const status of ["failed", "blocked"] as const) {
      const failed = job("analyze", status);
      expect(decide(fresh({ pendingAnalysis: 2, jobs: [failed] }))).toEqual({ stop: { reason: "job_failed", notify: true, job: failed } });
    }
  });

  it("başarılı iş yeni en son iş olunca zincir kaldığı yerden sürer", () => {
    expect(decide(fresh({ pendingLabels: 2, jobs: [job("analyze", "succeeded"), job("analyze", "failed")] }))).toEqual({ request: { kind: "label" } });
  });

  it("iş sürerken bekler; iptal edilmiş son iş sessiz durdurur", () => {
    expect(decide(fresh({ pendingAnalysis: 2, jobs: [job("analyze", "running")] }))).toEqual({ stop: { reason: "active_job", notify: false } });
    expect(decide(fresh({ pendingAnalysis: 2, jobs: [job("analyze", "queued")] }))).toEqual({ stop: { reason: "active_job", notify: false } });
    expect(decide(fresh({ pendingAnalysis: 2, jobs: [job("analyze", "cancelled")] }))).toEqual({ stop: { reason: "cancelled", notify: false } });
  });

  it("günlük tavan: sınırın altında açar, sınırda durur", () => {
    const facts = fresh({ pendingAnalysis: 2 });
    expect(decide(facts, { chainJobsToday: CYCLE_RULES.chainDailyMax - 1 })).toEqual({ request: { kind: "analyze" } });
    expect(decide(facts, { chainJobsToday: CYCLE_RULES.chainDailyMax })).toEqual({ stop: { reason: "daily_cap", notify: false } });
  });

  it("hesap yoksa zincir açamaz (onboarding para harcar): sessiz durur", () => {
    expect(decide(fresh({ ownAccounts: 0, trackedRivals: 0 }))).toEqual({ stop: { reason: "not_requestable", step: "account", notify: false } });
  });
});

describe("nextCycleStep · yayın adımı", () => {
  it("zincir order_return ve publish açar (ikisi $0); onay bekleyen satırda yalnız durur, onaylamaz", () => {
    const withQueue = (publishQueue: NonNullable<CycleFacts["publishQueue"]>) => decide(fresh({ publishQueue }));
    expect(withQueue({ returnable: 1, awaitingApproval: 0, dueForPublish: 0, approved: 0 })).toEqual({ request: { kind: "order_return" } });
    expect(withQueue({ returnable: 0, awaitingApproval: 0, dueForPublish: 1, approved: 1 })).toEqual({ request: { kind: "publish" } });
    const waiting = withQueue({ returnable: 0, awaitingApproval: 2, dueForPublish: 0, approved: 0 });
    expect("request" in waiting).toBe(false);
    expect(isChainSafeKind("publish")).toBe(true);
    expect(isChainSafeKind("order_return")).toBe(true);
  });
});

describe("nextCycleStep · boşa dönen publish (Ö6)", () => {
  const idlePublish: CycleLastJob = { kind: "publish", status: "succeeded", finishedAt: daysAgo(0), outcome: "nothing_to_do" };
  const queue = (approved: number) => ({ returnable: 0, awaitingApproval: 0, dueForPublish: 1, approved });

  it("hep 'bekliyor' dönen ready satırla ikinci publish açılmaz; sıradaki adıma geçilir", () => {
    const facts = fresh({ publishQueue: queue(0), jobs: [idlePublish], lastMeasuredAt: daysAgo(3) });
    expect(deriveCycle(facts, NOW).next).toBe("share");
    expect(decide(facts)).toEqual({ request: { kind: "measure_zernio" } });
    expect(decide(fresh({ publishQueue: queue(0), jobs: [idlePublish] }))).toEqual({ stop: { reason: "complete", notify: false } });
  });

  it("saati geçmiş ready satır varken atlama süreli: 59. dakikada atlanır, 61. dakikada publish açılır (Y3)", () => {
    const finishedMinutesAgo = (minutes: number): CycleLastJob => ({ ...idlePublish, finishedAt: new Date(NOW.getTime() - minutes * 60_000).toISOString() });
    const at = (minutes: number) => decide(fresh({ publishQueue: queue(0), jobs: [finishedMinutesAgo(minutes)] }));
    expect(at(59)).toEqual({ stop: { reason: "complete", notify: false } });
    expect(at(61)).toEqual({ request: { kind: "publish" } });
    // Saati geçmiş ready yoksa (yalnız gelecekteki ready) atlama süresiz kalır.
    const noDue = { returnable: 0, awaitingApproval: 0, dueForPublish: 0, approved: 0 };
    expect(decide(fresh({ publishQueue: noDue, jobs: [finishedMinutesAgo(600)] }))).toEqual({ stop: { reason: "complete", notify: false } });
  });

  it("insanca onaylanmış yeni (approved) satır varsa publish yine açılır", () => {
    expect(decide(fresh({ publishQueue: queue(1), jobs: [idlePublish] }))).toEqual({ request: { kind: "publish" } });
  });

  it("araya iş gören toplama girince eski 'iş yok' bilgisi bayatlar", () => {
    const collected: CycleLastJob = { kind: "collect", status: "succeeded", finishedAt: daysAgo(0), outcome: "ok" };
    expect([...noProgressKinds([collected, idlePublish])]).toEqual([]);
    expect([...noProgressKinds([idlePublish])]).toEqual(["publish"]);
  });
});

describe("nextCycleStep · Ö1 işin kendi seçim kuralı", () => {
  const idle = (kind: CycleLastJob["kind"]): CycleLastJob => ({ kind, status: "succeeded", finishedAt: daysAgo(0), outcome: "nothing_to_do" });

  it("analyze / label / measure 'yapacak iş yok' dediyse zincir aynı adımı yeniden açmaz", () => {
    expect([...noProgressKinds([idle("analyze"), idle("label"), idle("measure")])].sort()).toEqual(["analyze", "label", "measure"]);
    const stuck = fresh({ pendingAnalysis: 4, pendingLabels: 3, jobs: [idle("analyze"), idle("label")] });
    const decision = decide(stuck);
    expect("request" in decision ? decision.request.kind : undefined).not.toBe("analyze");
    expect("request" in decision ? decision.request.kind : undefined).not.toBe("label");
  });

  it("bekleyen sayacı varken ve iş boşa dönmediyse analyze açılır", () => {
    expect(decide(fresh({ pendingAnalysis: 4 }))).toEqual({ request: { kind: "analyze" } });
  });
});

describe("nextCycleStep · kısmi iş (Ö10)", () => {
  it("son iş partial ise zincir step_failed ile durur ve haber verir; nothing_to_do'lu partial durdurmaz", () => {
    const partial: CycleLastJob = { kind: "analyze", status: "partial", finishedAt: daysAgo(0), outcome: "credits_exhausted" };
    expect(decide(fresh({ jobs: [partial] }))).toEqual({ stop: { reason: "step_failed", notify: true, job: partial } });
    const idlePartial: CycleLastJob = { ...partial, outcome: "nothing_to_do" };
    const decision = decide(fresh({ jobs: [idlePartial] }));
    expect("stop" in decision && decision.stop.reason === "step_failed").toBe(false);
  });
});
