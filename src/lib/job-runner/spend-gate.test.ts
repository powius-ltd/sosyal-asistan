import { describe, expect, it } from "vitest";

import { JOB_APPROVAL_TTL_MS, JOB_SPEND_MAX_USD, type JobApproval, type PanelJob } from "@/lib/domain/panel-job";
import { routineCollectMaxUsd, spendGate } from "@/lib/job-runner/spend-gate";
import { approval, NOW, USER_ID } from "@/lib/job-runner/test-support";

const job = (kind: PanelJob["kind"], given?: JobApproval, dryRun = false) => ({ kind, dryRun, approval: given });
const agedMs = (ms: number): JobApproval => ({ basis: "one_time", maxUsd: 0.2, approvedBy: USER_ID, approvedAt: new Date(NOW.getTime() - ms).toISOString() });

describe("spendGate: tavan yalnız satırdaki onaydan", () => {
  it("onay kaydı yoksa kapalı", () => {
    expect(spendGate(job("collect"), NOW)).toMatchObject({ open: false, code: "approval_missing" });
    expect(spendGate(job("measure"), NOW)).toMatchObject({ open: false, code: "approval_missing" });
  });

  it("taze tek seferlik onay: açık ve tavan = satırdaki tutar", () => {
    expect(spendGate(job("collect", approval(0.17)), NOW)).toEqual({ open: true, basis: "one_time", maxUsd: 0.17 });
    expect(spendGate(job("measure", approval(0.05)), NOW)).toEqual({ open: true, basis: "one_time", maxUsd: 0.05 });
  });

  it("24 saat sınırı: tam sınırda açık, 1 ms sonrası kapalı (approval_expired); gelecekteki ya da okunamayan an kapalı", () => {
    expect(spendGate(job("collect", agedMs(JOB_APPROVAL_TTL_MS)), NOW).open).toBe(true);
    expect(spendGate(job("collect", agedMs(JOB_APPROVAL_TTL_MS + 1)), NOW)).toMatchObject({ open: false, code: "approval_expired" });
    expect(spendGate(job("collect", agedMs(-60_000)), NOW)).toMatchObject({ open: false, code: "approval_expired" });
    expect(spendGate(job("collect", { ...approval(0.2), approvedAt: "dün" }), NOW)).toMatchObject({ open: false, code: "approval_expired" });
  });

  it("tür tablosunda olmayan dayanak kapalı (toplamada aylık tavan yok); ölçümde aylık tavan açık ve tutarsız", () => {
    const monthly: JobApproval = { basis: "monthly_cap", approvedBy: USER_ID, approvedAt: NOW.toISOString() };
    expect(spendGate(job("collect", monthly), NOW)).toMatchObject({ open: false, code: "approval_missing" });
    expect(spendGate(job("routine", monthly), NOW)).toMatchObject({ open: false, code: "approval_missing" });
    expect(spendGate(job("measure", monthly), NOW)).toEqual({ open: true, basis: "monthly_cap" });
    expect(spendGate(job("analyze", approval(0.2)), NOW)).toMatchObject({ open: false, code: "approval_missing" });
  });

  it("geçersiz tutar kapalı: yok, 0, negatif, sınır üstü, sayı değil", () => {
    for (const maxUsd of [undefined, 0, -0.1, JOB_SPEND_MAX_USD + 0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(spendGate(job("collect", { ...approval(0.2), maxUsd }), NOW), String(maxUsd)).toMatchObject({ open: false, code: "approval_missing" });
    }
    expect(spendGate(job("collect", approval(JOB_SPEND_MAX_USD)), NOW).open).toBe(true);
  });
});

describe("spendGate: ajan tavanı (toplama / rakip bulma, aylık tavan)", () => {
  const monthly: JobApproval = { basis: "monthly_cap", approvedBy: USER_ID, approvedAt: NOW.toISOString() };
  const agentJob = (kind: PanelJob["kind"], given?: JobApproval) => ({ kind, dryRun: false, approval: given, params: { source: "agent" as const } });

  it("ajan işaretli collect / discover aylık tavanla açık (tutarsız: kalan hakkı çalışma alanı çözer)", () => {
    for (const kind of ["collect", "discover"] as const) expect(spendGate(agentJob(kind, monthly), NOW), kind).toEqual({ open: true, basis: "monthly_cap" });
  });

  it("işaretsiz ya da halka işaretli satırda aylık tavan kapalı; ajan işareti tek seferlik onayı genişletmez", () => {
    for (const kind of ["collect", "discover"] as const) {
      expect(spendGate({ kind, approval: monthly }, NOW), kind).toMatchObject({ open: false, code: "approval_missing" });
      expect(spendGate({ kind, approval: monthly, params: { source: "cycle" } }, NOW), kind).toMatchObject({ open: false, code: "approval_missing" });
    }
    expect(spendGate(agentJob("collect", approval(0.17)), NOW)).toEqual({ open: true, basis: "one_time", maxUsd: 0.17 });
  });

  it("ajan işareti başka türlere aylık tavan açmaz (routine, onboarding, analyze)", () => {
    for (const kind of ["routine", "onboarding", "analyze", "publish"] as const) expect(spendGate(agentJob(kind, monthly), NOW).open, kind).toBe(false);
  });

  it("eskimiş onay ajan işinde de kapalı", () => {
    const old: JobApproval = { basis: "monthly_cap", approvedBy: USER_ID, approvedAt: new Date(NOW.getTime() - JOB_APPROVAL_TTL_MS - 1).toISOString() };
    expect(spendGate(agentJob("collect", old), NOW)).toMatchObject({ open: false, code: "approval_expired" });
  });
});

describe("routineCollectMaxUsd", () => {
  it("yalnız taze tek seferlik onayda satırdaki tutar; onaysız, eskimiş ya da önizleme → undefined", () => {
    expect(routineCollectMaxUsd(job("routine", approval(0.3)), NOW)).toBe(0.3);
    expect(routineCollectMaxUsd(job("routine"), NOW)).toBeUndefined();
    expect(routineCollectMaxUsd(job("routine", agedMs(JOB_APPROVAL_TTL_MS + 1)), NOW)).toBeUndefined();
    expect(routineCollectMaxUsd(job("routine", approval(0.3), true), NOW)).toBeUndefined();
  });
});
