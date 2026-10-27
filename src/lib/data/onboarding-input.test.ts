import { describe, expect, it } from "vitest";

import { assertJobApprovalAllowed, jobCreditHold, parseRequestJobInput } from "@/lib/data/job-input";
import { jobParamsSchema, jobResultSchema, onboardingProbeResultSchema, requestPanelJobArgs } from "@/lib/data/job-schema";
import { parseConfirmOnboardingAccount, parseStartOnboardingBuild } from "@/lib/data/onboarding-input";
import { CREDIT_UNIT_PRICES, estimateJobCredits } from "@/lib/domain/credit-pricing";
import { jobCreditCeiling, jobHoldCredits } from "@/lib/domain/job-credits";
import { ONBOARDING_ANALYZE_LIMIT, ONBOARDING_PHASE_SPEC, ONBOARDING_RIVALS_MAX } from "@/lib/domain/onboarding-job";

const invalid = expect.objectContaining({ code: "invalid_input" });
const rivals = (count: number) => Array.from({ length: count }, (_, index) => `cp_${index + 1}`);

describe("başlangıç işi isteği (requestJob girdisi)", () => {
  it("onay SUNUCUDA kurulur: aşamanın sabit tavanı, dayanak onboarding; önizleme yok", () => {
    expect(parseRequestJobInput({ kind: "onboarding", phase: "probe" })).toEqual({
      kind: "onboarding",
      dryRun: false,
      params: { phase: "probe" },
      approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.probe.maxUsd },
    });
    expect(parseRequestJobInput({ kind: "onboarding", phase: "build", rivalIds: rivals(2) })).toEqual({
      kind: "onboarding",
      dryRun: false,
      params: { phase: "build", rivalIds: ["cp_1", "cp_2"] },
      approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC.build.maxUsd },
    });
    expect(parseRequestJobInput({ kind: "onboarding", phase: "build", rivalIds: [] }).params, "boş seçim = rakipsiz: alan yazılmaz").toEqual({ phase: "build" });
  });

  it("tavan, onay, kredi sınırı, önizleme ve bilinmeyen alan girdiden GELEMEZ; rakip seçimi yalnız ilk turda ve sınırlı", () => {
    const bad: unknown[] = [
      { kind: "onboarding" },
      { kind: "onboarding", phase: "resume" },
      { kind: "onboarding", phase: "build", approval: { basis: "one_time", maxUsd: 2 } },
      { kind: "onboarding", phase: "build", approval: { basis: "onboarding", maxUsd: 2 } },
      { kind: "onboarding", phase: "build", maxUsd: 2 },
      { kind: "onboarding", phase: "build", maxCredits: 10 },
      { kind: "onboarding", phase: "probe", dryRun: true },
      { kind: "onboarding", phase: "probe", limit: 50 },
      { kind: "onboarding", phase: "probe", workspaceId: "00000000-0000-4000-8000-000000000000" },
      { kind: "onboarding", phase: "probe", rivalIds: ["cp_1"] },
      { kind: "onboarding", phase: "build", rivalIds: rivals(ONBOARDING_RIVALS_MAX + 1) },
      { kind: "onboarding", phase: "build", rivalIds: ["cp_1", "cp_1"] },
      { kind: "onboarding", phase: "build", rivalIds: [""] },
      { kind: "onboarding", phase: "build", rivalIds: "cp_1" },
      { kind: "collect", approval: { basis: "onboarding" } },
      { kind: "routine", approval: { basis: "onboarding", maxUsd: 0.4 } },
    ];
    for (const input of bad) expect(() => parseRequestJobInput(input), JSON.stringify(input)).toThrow(invalid);
  });

  it("RPC argümanları: dayanak ve sabit tutar satıra yazılır; harcama kapalıysa (aylık tavan 0) iş açılmaz", () => {
    const request = parseRequestJobInput({ kind: "onboarding", phase: "build" });
    expect(requestPanelJobArgs("ws", "test_q", request, "user")).toMatchObject({ p_kind: "onboarding", p_dry_run: false, p_params: { phase: "build" }, p_approval_basis: "onboarding", p_approved_max_usd: ONBOARDING_PHASE_SPEC.build.maxUsd });
    expect(() => assertJobApprovalAllowed(request, { apifyMonthlyCapUsd: 10 })).not.toThrow();
    expect(() => assertJobApprovalAllowed(request, { apifyMonthlyCapUsd: 0 })).toThrow(invalid);
  });

  it("kredi: zorlama açıkken aşamanın SABİT tavanı ayrılır; kapalıyken ayırma yok; döküm tavanın içinde", () => {
    const probe = parseRequestJobInput({ kind: "onboarding", phase: "probe" });
    const build = parseRequestJobInput({ kind: "onboarding", phase: "build" });
    expect(jobCreditHold(probe, false)).toBeUndefined();
    expect(jobCreditHold(probe, true)).toBe(ONBOARDING_PHASE_SPEC.probe.maxCredits);
    expect(jobCreditHold(build, true)).toBe(ONBOARDING_PHASE_SPEC.build.maxCredits);
    expect(jobCreditCeiling("onboarding"), "aşama verilmezse ilk turun tavanı").toBe(ONBOARDING_PHASE_SPEC.build.maxCredits);
    expect(jobHoldCredits("onboarding", { phase: "probe", approved: 5000 }), "girdiyle büyütülemez").toBe(ONBOARDING_PHASE_SPEC.probe.maxCredits);
    // İlk turun en çok dökümü (kendi + en çok rakip, tek parti inceleme, plan, notlar) ve bakışın tek hesabı sabit tavana sığar.
    const estimate = estimateJobCredits("onboarding", { accounts: 1 + ONBOARDING_RIVALS_MAX, videos: ONBOARDING_ANALYZE_LIMIT });
    expect(estimate?.maxCredits).toBeLessThanOrEqual(ONBOARDING_PHASE_SPEC.build.maxCredits);
    expect(CREDIT_UNIT_PRICES.account_scan).toBeLessThanOrEqual(ONBOARDING_PHASE_SPEC.probe.maxCredits);
  });
});

describe("başlangıç işi satır sözleşmesi (jsonb)", () => {
  const profile = { platform: "instagram", handle: "ornek.hesap", displayName: "Örnek Hesap", followers: 1200, postsCount: 48 } as const;

  it("params: aşama + (yalnız ilk turda) rakip seçimi", () => {
    expect(jobParamsSchema.parse({ phase: "probe" })).toEqual({ phase: "probe" });
    expect(jobParamsSchema.parse({ phase: "build", rivalIds: rivals(ONBOARDING_RIVALS_MAX) }).rivalIds).toHaveLength(ONBOARDING_RIVALS_MAX);
    for (const bad of [{ phase: "resume" }, { phase: "probe", rivalIds: ["cp_1"] }, { rivalIds: ["cp_1"] }, { phase: "build", rivalIds: rivals(ONBOARDING_RIVALS_MAX + 1) }, { phase: "build", maxUsd: 1 }]) {
      expect(jobParamsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("probe çıktısı: profil özeti + video sayısı + aday özeti + tür ön seçimi + konu taslağı; bilinmeyen alan yazılmaz (0 değil)", () => {
    const full = { profile, videoCount: 25, candidates: { total: 6, similarSize: 4 }, suggestedAccountType: "creator", nicheDraft: "Evde kahve demleme ve ekipman önerileri." } as const;
    expect(onboardingProbeResultSchema.parse(full)).toEqual(full);
    expect(onboardingProbeResultSchema.parse({ profile: { platform: "instagram", handle: "ornek.hesap" } })).toEqual({ profile: { platform: "instagram", handle: "ornek.hesap" } });
    expect(jobResultSchema.parse({ exitCode: 0, probe: full }).probe).toEqual(full);
    expect(jobResultSchema.parse({ outcome: "account_private" })).toEqual({ outcome: "account_private" });
  });

  it("probe çıktısı kimlik / fotoğraf / yorumcu alanı TAŞIMAZ; bozuk şekil reddedilir", () => {
    const bad: unknown[] = [
      {},
      { profile: { ...profile, avatarUrl: "https://example.com/a.jpg" } },
      { profile: { ...profile, externalId: "123" } },
      { profile, latestComments: [] },
      { profile, candidates: { total: 2, handles: ["x"] } },
      { profile: { ...profile, handle: "Büyük Harf" } },
      { profile: { ...profile, platform: "facebook" } },
      { profile, videoCount: -1 },
      { profile, videoCount: 2.5 },
      { profile, suggestedAccountType: "agency" },
      { profile, nicheDraft: "" },
    ];
    for (const value of bad) expect(onboardingProbeResultSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});

describe("akış girdileri", () => {
  it("hesap onayı: tür zorunlu (kullanıcı kararı); konu isteğe bağlı, boş metin tanımı siler; fazla alan reddedilir", () => {
    expect(parseConfirmOnboardingAccount({ accountType: "creator" })).toEqual({ accountType: "creator" });
    expect(parseConfirmOnboardingAccount({ accountType: "mixed", nicheBrief: "  Kahve  " })).toEqual({ accountType: "mixed", nicheBrief: "Kahve" });
    expect(parseConfirmOnboardingAccount({ accountType: "business", nicheBrief: "" })).toEqual({ accountType: "business", nicheBrief: "" });
    for (const bad of [{}, { accountType: "agency" }, { nicheBrief: "x" }, { accountType: "creator", contentLanguage: "tr" }, { accountType: "creator", accountConfirmedAt: "2026-01-01" }, null]) {
      expect(() => parseConfirmOnboardingAccount(bad), JSON.stringify(bad)).toThrow(invalid);
    }
  });

  it("Başlat: rakip listesi her zaman dizi (boş = rakipsiz); tavan / onay alanı kabul edilmez", () => {
    expect(parseStartOnboardingBuild(undefined)).toEqual({ rivalIds: [] });
    expect(parseStartOnboardingBuild({})).toEqual({ rivalIds: [] });
    expect(parseStartOnboardingBuild({ rivalIds: rivals(ONBOARDING_RIVALS_MAX) })).toEqual({ rivalIds: rivals(ONBOARDING_RIVALS_MAX) });
    for (const bad of [{ rivalIds: rivals(ONBOARDING_RIVALS_MAX + 1) }, { rivalIds: ["a", "a"] }, { maxUsd: 5 }, { rivalIds: [], approval: { basis: "one_time", maxUsd: 2 } }]) {
      expect(() => parseStartOnboardingBuild(bad), JSON.stringify(bad)).toThrow(invalid);
    }
  });
});
