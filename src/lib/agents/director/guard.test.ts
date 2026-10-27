import { describe, expect, it } from "vitest";

import { agentBudget } from "@/lib/agents/director/budget";
import { FORBIDDEN_ACTIONS, guardProposal, type GuardContext } from "@/lib/agents/director/guard";
import { JOB_KINDS, JOB_KIND_SPEC } from "@/lib/domain/panel-job";

const NOW = new Date("2026-10-23T09:00:00Z");
const base = (over: Partial<GuardContext> = {}): GuardContext => ({
  now: NOW, budget: agentBudget({ capUsd: 3, spentUsd: 0 }), estimates: { collect: 0.5, discover: 0.5 }, activeJob: false, jobsToday: 0, lastPaidAt: {}, collectEveryDays: 14, ...over,
});
const open = (kind: string, ctx = base()) => guardProposal({ action: "open_job", kind }, ctx);

describe("ajan kapısı", () => {
  it("yasak eylemler hiçbir girdide geçmez", () => {
    for (const action of FORBIDDEN_ACTIONS) {
      for (const ctx of [base(), base({ budget: agentBudget({ capUsd: 1000, spentUsd: 0 }) })]) {
        const verdict = guardProposal({ action, kind: "publish" }, ctx);
        expect(verdict.allowed, action).toBe(false);
      }
    }
  });
  it("bilinmeyen eylem ve tür reddedilir; tür verilmezse de", () => {
    expect(guardProposal({ action: "rm_rf" }, base()).allowed).toBe(false);
    expect(open("onboarding").allowed).toBe(false);
    expect(open("routine").allowed).toBe(false);
    expect(open("measure").allowed).toBe(false);
    expect(open("").allowed).toBe(false);
    expect(guardProposal({ action: "open_job" }, base()).allowed).toBe(false);
  });
  it("$0 türler geçer, para harcayan diğer türler (collect/discover dışı) geçmez", () => {
    for (const kind of JOB_KINDS) {
      const verdict = open(kind);
      if (verdict.allowed) expect(["collect", "discover"].includes(kind) || JOB_KIND_SPEC[kind].spend === "never", kind).toBe(true);
    }
    expect(open("analyze").allowed).toBe(true);
  });
  it("tavan onaysızken ücretli iş açılmaz; 0 tavan da açmaz", () => {
    expect(open("collect", base({ budget: agentBudget({ spentUsd: 0 }) }))).toMatchObject({ allowed: false, reason: "cap_not_approved" });
    expect(open("discover", base({ budget: agentBudget({ capUsd: 0, spentUsd: 0 }) }))).toMatchObject({ allowed: false, reason: "cap_exceeded" });
  });
  it("tavan aşımı ve tahminsiz iş reddedilir", () => {
    expect(open("collect", base({ budget: agentBudget({ capUsd: 3, spentUsd: 2.8 }) }))).toMatchObject({ allowed: false, reason: "cap_exceeded" });
    expect(open("collect", base({ estimates: {} }))).toMatchObject({ allowed: false, reason: "no_estimate" });
    expect(open("collect", base({ estimates: { collect: 3.01 } })).allowed).toBe(false);
    expect(open("collect", base({ estimates: { collect: 3 } })).allowed).toBe(true);
  });
  it("sıklık: toplama ayardaki gün, rakip bulma 14 gün dolmadan açılmaz", () => {
    const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
    expect(open("collect", base({ lastPaidAt: { collect: daysAgo(13) } }))).toMatchObject({ allowed: false, reason: "too_soon" });
    expect(open("collect", base({ lastPaidAt: { collect: daysAgo(14) } })).allowed).toBe(true);
    expect(open("collect", base({ collectEveryDays: 3, lastPaidAt: { collect: daysAgo(4) } })).allowed).toBe(true);
    expect(open("discover", base({ lastPaidAt: { discover: daysAgo(5) } }))).toMatchObject({ allowed: false, reason: "too_soon" });
  });
  it("süren iş ve günlük sınır her türü durdurur", () => {
    expect(open("analyze", base({ activeJob: true }))).toMatchObject({ allowed: false, reason: "active_job" });
    expect(open("analyze", base({ jobsToday: 8 }))).toMatchObject({ allowed: false, reason: "daily_cap" });
  });
  it("notify / wait / ask_approval iş açmaz", () => {
    for (const action of ["notify", "wait", "ask_approval"]) expect(guardProposal({ action }, base())).toEqual({ allowed: true, action });
  });
});
