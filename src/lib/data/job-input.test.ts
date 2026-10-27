import { describe, expect, it, vi } from "vitest";

import { assertJobApprovalAllowed, jobApprovalProblem, jobIdSchema, parseRequestJobInput, requestJobSchema, requestRoutineForAllSchema } from "@/lib/data/job-input";
import { JOB_COLLECT_LIMIT_MAX, JOB_SPEND_MAX_USD } from "@/lib/domain/panel-job";

const invalid = expect.objectContaining({ code: "invalid_input" });
const approval = { basis: "one_time", maxUsd: 0.2 } as const;

describe("parseRequestJobInput", () => {
  it("geçerli istekleri normalleştirir: tür, kuru koşu, para dışı parametreler, onay", () => {
    expect(parseRequestJobInput({ kind: "routine" })).toEqual({ kind: "routine", dryRun: false, params: {} });
    expect(parseRequestJobInput({ kind: "routine", dryRun: true })).toEqual({ kind: "routine", dryRun: true, params: {} });
    expect(parseRequestJobInput({ kind: "routine", approval })).toEqual({ kind: "routine", dryRun: false, params: {}, approval });
    expect(parseRequestJobInput({ kind: "collect", dryRun: true, limit: 5 })).toEqual({ kind: "collect", dryRun: true, params: { limit: 5 } });
    expect(parseRequestJobInput({ kind: "collect", limit: JOB_COLLECT_LIMIT_MAX, approval: { basis: "one_time", maxUsd: JOB_SPEND_MAX_USD } })).toEqual({
      kind: "collect",
      dryRun: false,
      params: { limit: JOB_COLLECT_LIMIT_MAX },
      approval: { basis: "one_time", maxUsd: JOB_SPEND_MAX_USD },
    });
    expect(parseRequestJobInput({ kind: "measure", approval: { basis: "monthly_cap" } })).toEqual({ kind: "measure", dryRun: false, params: {}, approval: { basis: "monthly_cap" } });
    expect(parseRequestJobInput({ kind: "plan", week: "2026-10-05" })).toEqual({ kind: "plan", dryRun: false, params: { week: "2026-10-05" } });
    for (const kind of ["analyze", "label", "briefing", "plan"] as const) expect(parseRequestJobInput({ kind })).toEqual({ kind, dryRun: false, params: {} });
  });

  it("ONAYSIZ HARCAMA, yanlış yerde onay, sınır dışı tutar, bilinmeyen tür / alan → invalid_input", () => {
    const bad: unknown[] = [
      null,
      "routine",
      {},
      { kind: "deploy" },
      { kind: "collect" },
      { kind: "measure" },
      { kind: "measure", dryRun: false },
      { kind: "analyze", approval },
      { kind: "analyze", dryRun: true },
      { kind: "plan", dryRun: true },
      { kind: "collect", dryRun: true, approval },
      { kind: "routine", dryRun: true, approval },
      { kind: "collect", approval: { basis: "one_time", maxUsd: 0 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: -0.1 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: JOB_SPEND_MAX_USD + 0.001 } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: Number.NaN } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: Number.POSITIVE_INFINITY } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: "0.2" } },
      { kind: "collect", approval: { basis: "one_time" } },
      { kind: "collect", approval: { basis: "one_time", maxUsd: 0.2, approvedBy: "x" } },
      { kind: "collect", approval: { basis: "monthly_cap", maxUsd: 0.2 } },
      { kind: "collect", approval: { basis: "monthly_cap" } },
      { kind: "routine", approval: { basis: "monthly_cap" } },
      { kind: "routine", approval: {} },
      { kind: "collect", dryRun: true, limit: 0 },
      { kind: "collect", dryRun: true, limit: JOB_COLLECT_LIMIT_MAX + 1 },
      { kind: "collect", dryRun: true, limit: 1.5 },
      { kind: "plan", week: "2026-10-06" },
      { kind: "plan", week: "2026-13-01" },
      { kind: "plan", week: 20261005 },
      { kind: "routine", dryRun: "true" },
      { kind: "routine", workspaceId: "00000000-0000-4000-8000-000000000000" },
      { kind: "routine", queue: "panel" },
      { kind: "routine", command: "npm run rutin" },
      { kind: "briefing", limit: 3 },
    ];
    for (const input of bad) expect(() => parseRequestJobInput(input), JSON.stringify(input)).toThrowError(invalid);
  });

  it("hata mesajları Türkçe ve kullanıcıya gösterilebilir", () => {
    const message = (input: unknown) => requestJobSchema.safeParse(input).error?.issues[0]?.message;
    expect(message({ kind: "collect" })).toBe("Bu iş para harcar: tutar onayı olmadan başlatılamaz.");
    expect(message({ kind: "collect", dryRun: true, approval })).toBe("Önizleme para harcamaz: onay verilemez.");
    expect(message({ kind: "deploy" })).toBe("Bilinmeyen iş türü.");
    expect(message({ kind: "routine", queue: "panel" })).toBe("Bu iş türünde geçersiz bir alan gönderildi.");
    expect(message({ kind: "collect", approval: { basis: "one_time", maxUsd: 5 } })).toMatch(/en çok 2 USD/);
    expect(message({ kind: "collect", approval: { basis: "monthly_cap" } })).toBe("Bu iş türünde bu onay biçimi kullanılamaz.");
    expect(jobApprovalProblem("analyze", false, approval)).toBe("Bu iş para harcamaz: onay verilemez.");
    expect(jobApprovalProblem("routine", false, undefined)).toBeUndefined();
  });
});

describe("assertJobApprovalAllowed (çalışma alanının tavan durumu)", () => {
  const caps = { apifyMonthlyCapUsd: 10 };

  it("onaysız istek ve kullanılabilir dayanak geçer", () => {
    expect(() => assertJobApprovalAllowed({ kind: "analyze" }, { apifyMonthlyCapUsd: 0 })).not.toThrow();
    expect(() => assertJobApprovalAllowed({ kind: "collect", approval }, caps)).not.toThrow();
    expect(() => assertJobApprovalAllowed({ kind: "measure", approval }, caps)).not.toThrow();
    expect(() => assertJobApprovalAllowed({ kind: "measure", approval: { basis: "monthly_cap" } }, { ...caps, measureMonthlyCapUsd: 1 })).not.toThrow();
  });

  it("aylık tavan onaysızken monthly_cap, ölçüm kapalıyken ölçüm, Apify kapalıyken her onay → invalid_input", () => {
    expect(() => assertJobApprovalAllowed({ kind: "measure", approval: { basis: "monthly_cap" } }, caps)).toThrowError(invalid);
    expect(() => assertJobApprovalAllowed({ kind: "measure", approval }, { ...caps, measureMonthlyCapUsd: 0 })).toThrowError(invalid);
    expect(() => assertJobApprovalAllowed({ kind: "collect", approval }, { apifyMonthlyCapUsd: 0 })).toThrowError(invalid);
    expect(() => assertJobApprovalAllowed({ kind: "routine", approval }, { apifyMonthlyCapUsd: 0 })).toThrowError(invalid);
  });
});

describe("action girdileri", () => {
  it("tüm hesaplar: yalnız haftalık tur alanları; tür ve fazla alan kabul edilmez; kuru koşuya onay olmaz", () => {
    expect(requestRoutineForAllSchema.safeParse({}).success).toBe(true);
    expect(requestRoutineForAllSchema.safeParse({ dryRun: true }).success).toBe(true);
    expect(requestRoutineForAllSchema.safeParse({ approval }).success).toBe(true);
    for (const input of [{ kind: "routine" }, { dryRun: true, approval }, { approval: { basis: "monthly_cap" } }, { workspaces: ["x"] }, null]) {
      expect(requestRoutineForAllSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    }
  });

  it("iş kimliği: kırpılır; boş, uzun, metin olmayan ve fazla alanlı girdi geçmez", () => {
    expect(jobIdSchema.parse({ jobId: "  job_07 " })).toEqual({ jobId: "job_07" });
    for (const input of [{ jobId: "" }, { jobId: "x".repeat(101) }, { jobId: 7 }, { jobId: "a", workspaceId: "b" }, {}]) {
      expect(jobIdSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
    }
  });
});

describe("zincir işareti (params.source)", () => {
  it("source=cycle yalnız zincir türlerinde ve yalnız o değerle kabul edilir; params'a taşınır", async () => {
    const { parseRequestJobInput } = await import("@/lib/data/job-input");
    expect(parseRequestJobInput({ kind: "analyze", source: "cycle" }).params).toEqual({ source: "cycle" });
    expect(parseRequestJobInput({ kind: "order", week: "2026-10-26", source: "cycle" }).params).toMatchObject({ source: "cycle" });
    expect(parseRequestJobInput({ kind: "analyze" }).params).toEqual({});
    expect(() => parseRequestJobInput({ kind: "analyze", source: "elle" })).toThrow();
    expect(() => parseRequestJobInput({ kind: "routine", source: "cycle" })).toThrow();
  });
});

describe("ads_sync müşteri kopyasında", () => {
  it("istek reddedilir; sürüm anahtarı yokken kabul", () => {
    vi.stubEnv("PANEL_EDITION", "kopya");
    try {
      expect(() => parseRequestJobInput({ kind: "ads_sync" })).toThrow(/reklam/);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(parseRequestJobInput({ kind: "ads_sync" })).toMatchObject({ kind: "ads_sync" });
  });
});

describe("ads_sync (reklam verisini okuma)", () => {
  it("alansız, onaysız, kuru koşusuz kabul edilir; onay, kredi ve kuru koşu alanı katı şemada reddedilir", () => {
    expect(parseRequestJobInput({ kind: "ads_sync" })).toEqual({ kind: "ads_sync", dryRun: false, params: {} });
    expect(() => parseRequestJobInput({ kind: "ads_sync", approval })).toThrow(invalid);
    expect(() => parseRequestJobInput({ kind: "ads_sync", dryRun: true })).toThrow(invalid);
    expect(() => parseRequestJobInput({ kind: "ads_sync", maxCredits: 5 })).toThrow(invalid);
  });
});

describe("ajan tavanı dayanağı (monthly_cap) toplama / rakip bulma", () => {
  const monthly = { basis: "monthly_cap" } as const;

  it("yalnız source=agent ile geçer; işaretsiz monthly_cap ve onaysız agent işareti reddedilir", () => {
    expect(parseRequestJobInput({ kind: "collect", approval: monthly, source: "agent", limit: 25 })).toMatchObject({ kind: "collect", params: { limit: 25, source: "agent" }, approval: monthly });
    expect(parseRequestJobInput({ kind: "discover", approval: monthly, source: "agent" })).toMatchObject({ kind: "discover", params: { source: "agent" } });
    expect(() => parseRequestJobInput({ kind: "collect", approval: monthly })).toThrow(/onay biçimi/);
    expect(() => parseRequestJobInput({ kind: "discover", approval: monthly })).toThrow(/onay biçimi/);
    expect(() => parseRequestJobInput({ kind: "collect", approval: { basis: "one_time", maxUsd: 0.2 }, source: "agent" })).toThrow(/Ajan işareti/);
  });

  it("ölçüm ve diğer türler monthly_cap'i ajan işaretiyle KULLANAMAZ (alan yok)", () => {
    expect(() => parseRequestJobInput({ kind: "measure", approval: monthly, source: "agent" })).toThrow();
    expect(() => parseRequestJobInput({ kind: "analyze", source: "agent" })).toThrow();
  });

  it("depo kapısı: ajan tavanı onaysız ya da 0 iken invalid_input; onaylı tavanda geçer", () => {
    const request = parseRequestJobInput({ kind: "collect", approval: monthly, source: "agent" });
    expect(() => assertJobApprovalAllowed(request, {})).toThrow(/Ajan tavanı/);
    expect(() => assertJobApprovalAllowed(request, { agentMonthlyCapUsd: 0 })).toThrow(/Ajan tavanı/);
    expect(() => assertJobApprovalAllowed(request, { agentMonthlyCapUsd: 3 })).not.toThrow();
  });
});
