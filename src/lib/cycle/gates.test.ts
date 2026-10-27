import { describe, expect, it } from "vitest";

import { gateByCredits, slipAllowedFor } from "@/lib/cycle/gates";
import { JOB_KINDS } from "@/lib/domain/panel-job";
import { jobCreditCeiling } from "@/lib/domain/job-credits";

describe("gateByCredits (Ö4)", () => {
  it("zorlama açıkken kredi harcayan tür açılmaz, onay ister", () => {
    const spender = JOB_KINDS.find((kind) => jobCreditCeiling(kind) > 0);
    expect(spender).toBeDefined();
    expect(gateByCredits({ request: { kind: spender! } }, true, () => "analyze")).toEqual({ stop: { reason: "needs_approval", notify: true, step: "analyze" } });
  });
  it("zorlama kapalıysa ya da tür kredi harcamıyorsa karar değişmez", () => {
    const spender = JOB_KINDS.find((kind) => jobCreditCeiling(kind) > 0)!;
    const free = JOB_KINDS.find((kind) => jobCreditCeiling(kind) <= 0)!;
    expect(gateByCredits({ request: { kind: spender } }, false)).toEqual({ request: { kind: spender } });
    expect(gateByCredits({ request: { kind: free } }, true)).toEqual({ request: { kind: free } });
    expect(gateByCredits({ stop: { reason: "complete", notify: false } }, true)).toEqual({ stop: { reason: "complete", notify: false } });
  });
});

describe("slipAllowedFor (Ö2)", () => {
  it("yalnız stüdyo slug'ı fiş üretebilir", () => {
    expect(slipAllowedFor("ornek", ["ornek"])).toBe(true);
    expect(slipAllowedFor("baska", ["ornek"])).toBe(false);
    expect(slipAllowedFor(null, ["ornek"])).toBe(false);
  });
});

describe("istanbulDayStart (Ö10 günlük sınır İstanbul gününe göre)", () => {
  it("UTC 21:30 İstanbul'da ertesi gündür; sınır 21:00Z'dir", async () => {
    const { istanbulDayStart } = await import("@/lib/cycle/gates");
    expect(istanbulDayStart(new Date("2026-10-20T21:30:00Z"))).toBe("2026-10-20T21:00:00.000Z");
    expect(istanbulDayStart(new Date("2026-10-20T20:59:00Z"))).toBe("2026-10-19T21:00:00.000Z");
  });
});
