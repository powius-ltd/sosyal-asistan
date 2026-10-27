/**
 * Başlangıç işi · `probe` ("hesaba bakış"), SAHTE bağımlılıklarla: her sonuç kodu, harcama tavanının adımlara kalan tutar olarak inmesi,
 * çıktının şemaya uyması, keşif / taslak hatasında işin düşmemesi, iptal, süre tavanı, kredi açık / kapalı.
 */
import { describe, expect, it } from "vitest";

import type { CollectSummary } from "@/lib/collection/types";
import { onboardingProbeResultSchema } from "@/lib/data/job-schema";
import { ONBOARDING_BIO_MAX_CHARS, ONBOARDING_COLLECT_LIMIT } from "@/lib/domain/onboarding-job";
import { probeResultOf, suggestAccountType } from "@/lib/job-runner/run-onboarding-probe";
import { collected, discovered, JOB_ID, profileOf, runOnboarding, verified, whileRunning } from "@/lib/job-runner/run-onboarding-test-support";

const NO_CONTENT = { parsed: 0, ingested: 0, snapshots: 0, notItems: 0, skipped: 0 };

describe("hesaba bakış: tam akış", () => {
  it("doğrula → topla → keşfet → taslak; çıktı şemaya uyar, fotoğraf / ilgili hesap taşınmaz", async () => {
    const { deps, closing, written, statuses, ran, result } = await runOnboarding("probe", {}, { deps: { settleSpend: async () => ({ reservedUsd: 0.11, actualUsd: 0.09, pending: 0 }) } });
    expect(result).toEqual({ status: "succeeded", lost: false, abandoned: false });
    expect(ran()).toEqual(["verify", "collect", "discover", "draft_niche"]);
    expect(statuses()).toEqual({ verify: "ok", collect: "ok", discover: "ok", draft_niche: "ok" });
    expect(closing?.status).toBe("succeeded");
    expect(written).toEqual({
      spend: { reservedUsd: 0.11, actualUsd: 0.09 },
      probe: {
        profile: { platform: "instagram", handle: "test.hesap", displayName: "Test Hesabı", bio: "Kısa biyografi.", followers: 1500, postsCount: 80, isVerified: false },
        videoCount: 25,
        candidates: { total: 12, similarSize: 5 },
        suggestedAccountType: "business",
        nicheDraft: "Örnek konu taslağı.",
      },
    });
    expect(onboardingProbeResultSchema.safeParse(written?.probe).success).toBe(true);
    expect(deps.settleSpend).toHaveBeenCalledTimes(1);
    expect(deps.settleSpend.mock.calls[0][1]).toBe(JOB_ID);
  });

  it("tavan satırdaki onaydır ve adımlara KALAN tutar iner: toplam harcama tavanı aşamaz", async () => {
    const { deps } = await runOnboarding("probe", {}, { deps: { verifyAccount: async () => verified({ reservedUsd: 0.01 }), collect: async () => collected(25, [], 0.07), discover: async () => discovered({ cost: { reservedUsd: 0.05, pendingReconcile: 0 } }) } });
    expect(deps.verifyAccount.mock.calls[0][0]).toMatchObject({ maxUsd: 0.2 });
    expect(deps.collect.mock.calls[0][0]).toMatchObject({ ownOnly: true, limit: ONBOARDING_COLLECT_LIMIT, maxUsd: 0.19, reconcileWaitMs: 0 });
    expect(deps.collect.mock.calls[0][0].dryRun).toBeUndefined();
    expect(deps.discover.mock.calls[0][0]).toMatchObject({ maxUsd: 0.12 });
  });

  it("işletme işareti yalnız ön seçimdir; bilinmiyorsa öneri yok", () => {
    expect(suggestAccountType({ isBusinessAccount: true })).toBe("business");
    expect(suggestAccountType({ isBusinessAccount: false })).toBe("creator");
    expect(suggestAccountType({})).toBeUndefined();
  });

  it("çıktı sınırları aşmaz: uzun biyografi kırpılır, ölçülemeyen alan yazılmaz (0 değil)", () => {
    const probe = probeResultOf({ profile: profileOf({ bio: "b".repeat(900), followers: undefined, postsCount: undefined, isVerified: undefined, isBusinessAccount: undefined, displayName: "   " }) });
    expect(probe.profile.bio?.length).toBeLessThanOrEqual(ONBOARDING_BIO_MAX_CHARS);
    expect(Object.keys(probe.profile).sort()).toEqual(["bio", "handle", "platform"]);
    expect(Object.keys(probe)).toEqual(["profile"]);
    expect(onboardingProbeResultSchema.safeParse(probe).success).toBe(true);
  });
});

describe("hesaba bakış: iş durduran sonuçlar", () => {
  const stopCases = [
    { name: "gizli hesap", verification: verified({ outcome: "private", reason: "hesap gizli", profile: undefined }), code: "account_private" },
    { name: "bulunamayan hesap", verification: verified({ outcome: "not_found", profile: undefined }), code: "account_not_found" },
    { name: "tahmin tavanı aşıyor", verification: verified({ outcome: "blocked", profile: undefined, reservedUsd: 0, reason: "tahmin tavanı aşıyor." }), code: "over_approved_amount" },
  ] as const;
  for (const stop of stopCases) {
    it(`${stop.name}: blocked + ${stop.code}; toplama / keşif / taslak ÇAĞRILMAZ, çıktı yazılmaz`, async () => {
      const { deps, closing, written, statuses } = await runOnboarding("probe", {}, { deps: { verifyAccount: async () => stop.verification } });
      expect(closing).toMatchObject({ status: "blocked", result: { outcome: stop.code } });
      expect(written?.probe).toBeUndefined();
      for (const name of ["collect", "discover", "draftNiche"] as const) expect(deps[name], name).not.toHaveBeenCalled();
      expect(statuses()).toMatchObject({ collect: "skipped", discover: "skipped", draft_niche: "skipped" });
    });
  }

  it("doğrulama koşusu düşerse iş failed + step_failed (yeniden denenebilir); sonraki adımlar çağrılmaz", async () => {
    const { deps, closing } = await runOnboarding("probe", {}, { deps: { verifyAccount: async () => verified({ outcome: "error", profile: undefined, reason: "ağ hatası" }) } });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "step_failed" } });
    expect(deps.collect).not.toHaveBeenCalled();
    const thrown = await runOnboarding("probe", {}, { deps: { verifyAccount: async () => Promise.reject(new Error("beklenmeyen")) } });
    expect(thrown.closing).toMatchObject({ status: "failed", result: { outcome: "step_failed" } });
    expect(thrown.deps.collect).not.toHaveBeenCalled();
  });

  it("video yok: blocked + no_videos; keşif çağrılmaz, profil özeti yine yazılır (videoCount 0)", async () => {
    const { deps, closing, written } = await runOnboarding("probe", {}, { deps: { collect: async () => collected(0) } });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "no_videos" } });
    expect(written?.probe).toMatchObject({ profile: { handle: "test.hesap" }, videoCount: 0 });
    expect(deps.discover).not.toHaveBeenCalled();
    expect(deps.draftNiche).not.toHaveBeenCalled();
  });

  it("toplama sırasında gizli çıkan hesap: account_private; toplama hatası: failed; tavanı aşan toplama: blocked", async () => {
    const hidden = await runOnboarding("probe", {}, { deps: { collect: async () => collected({ profile: { state: "private", reason: "hesap gizli" }, content: { ...NO_CONTENT, skippedReason: "hesap erişilemez" } }) } });
    expect(hidden.closing).toMatchObject({ status: "blocked", result: { outcome: "account_private" } });
    expect(hidden.written?.probe).toBeUndefined();

    const broken = await runOnboarding("probe", {}, { deps: { collect: async () => collected({ profile: { state: "ok" }, content: { ...NO_CONTENT, error: "Koşu tamamlanmadı" } }) } });
    expect(broken.closing).toMatchObject({ status: "failed", result: { outcome: "step_failed" } });

    const over: CollectSummary = { outcome: "blocked", targets: [], runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] };
    const blocked = await runOnboarding("probe", {}, { deps: { collect: async () => over } });
    expect(blocked.closing).toMatchObject({ status: "blocked", result: { outcome: "over_approved_amount" } });
    expect(blocked.deps.discover).not.toHaveBeenCalled();
  });
});

describe("hesaba bakış: iş düşürmeyen sonuçlar", () => {
  it("az video: few_videos uyarısıyla sürer (succeeded)", async () => {
    const { closing, written, step, deps } = await runOnboarding("probe", {}, { deps: { collect: async () => collected(4) } });
    expect(closing).toMatchObject({ status: "succeeded", result: { outcome: "few_videos" } });
    expect(step("collect")).toMatchObject({ status: "ok", code: "few_videos" });
    expect(written?.probe?.videoCount).toBe(4);
    expect(deps.discover).toHaveBeenCalledTimes(1);
  });

  it("keşif düşerse iş kısmi biter; taslak yine denenir, aday özeti yazılmaz (0 değil)", async () => {
    const { closing, written, statuses, deps } = await runOnboarding("probe", {}, { deps: { discover: async () => Promise.reject(new Error("Apify yanıt vermedi")) } });
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
    expect(statuses()).toMatchObject({ discover: "failed", draft_niche: "ok" });
    expect(written?.probe).toMatchObject({ videoCount: 25, nicheDraft: "Örnek konu taslağı." });
    expect(written?.probe !== undefined && "candidates" in written.probe).toBe(false);
    expect(deps.draftNiche).toHaveBeenCalledTimes(1);
  });

  it("platform keşfi desteklemiyorsa adım atlanır, iş tamam", async () => {
    const { closing, statuses } = await runOnboarding("probe", {}, { deps: { discover: async () => discovered({ outcome: "unsupported", candidates: { total: 0 }, notes: ["Platform modülü yok."] }) } });
    expect(closing?.status).toBe("succeeded");
    expect(statuses().discover).toBe("skipped");
  });

  it("konu taslağı çıkarılamazsa iş DÜŞMEZ: adım atlandı, taslak yok", async () => {
    const none = await runOnboarding("probe", {}, { deps: { draftNiche: async () => ({ reason: "llm_failed", persistent: true, note: "Yazı aracı yok." }) } });
    expect(none.closing?.status).toBe("succeeded");
    expect(none.step("draft_niche")).toMatchObject({ status: "skipped", code: "llm_unavailable" });
    expect(none.written?.probe !== undefined && "nicheDraft" in none.written.probe).toBe(false);
    const thrown = await runOnboarding("probe", {}, { deps: { draftNiche: async () => Promise.reject(new Error("beklenmeyen")) } });
    expect(thrown.closing?.status).toBe("succeeded");
    expect(thrown.written?.probe?.videoCount).toBe(25);
  });

  it("harcama özeti alınamazsa iş yine kapanır (rezerve tutar sayaçtan)", async () => {
    const { closing, written } = await runOnboarding("probe", {}, { deps: { settleSpend: async () => Promise.reject(new Error("db yok")) } });
    expect(closing?.status).toBe("succeeded");
    expect(written?.spend).toEqual({ reservedUsd: 0.13 });
  });
});

describe("hesaba bakış: iptal ve süre tavanı", () => {
  it("doğrulama sürerken iptal: çalışan adım biter, sıradaki adım başlamaz, iş cancelled", async () => {
    let cancel = () => {};
    const { deps, closing, statuses } = await runOnboarding("probe", {}, {
      arrange: (fake) => {
        cancel = () => fake.requestCancel();
      },
      deps: {
        verifyAccount: async () => {
          cancel();
          return verified();
        },
      },
    });
    expect(closing?.status).toBe("cancelled");
    expect(deps.verifyAccount).toHaveBeenCalledTimes(1);
    expect(deps.collect).not.toHaveBeenCalled();
    expect(statuses()).toMatchObject({ verify: "ok", collect: "pending" });
  });

  it("iş alınır alınmaz iptal edildiyse doğrulama bile başlamaz", async () => {
    const { deps, closing } = await runOnboarding("probe", {}, { arrange: (fake) => whileRunning(fake, "verify", () => fake.requestCancel()) });
    expect(closing?.status).toBe("cancelled");
    expect(deps.verifyAccount).not.toHaveBeenCalled();
  });

  it("süre tavanı dolmuşsa hiçbir adım başlamaz: failed + timeout", async () => {
    const { deps, closing } = await runOnboarding("probe", {}, { timeoutMs: 0 });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "timeout" } });
    expect(deps.verifyAccount).not.toHaveBeenCalled();
  });

  it("çit kaybı: yazım reddedilince sonraki adım çağrılmaz", async () => {
    const { deps, result } = await runOnboarding("probe", {}, { arrange: (fake) => whileRunning(fake, "verify", () => fake.loseFence()) });
    expect(result.lost).toBe(true);
    expect(deps.collect).not.toHaveBeenCalled();
  });
});

describe("hesaba bakış: kredi", () => {
  it("zorlama kapalı: hiçbir kredi çağrısı yapılmaz", async () => {
    const { credits, written } = await runOnboarding("probe");
    expect(credits.lookups).toEqual([]);
    expect(credits.settled).toEqual([]);
    expect(written?.credits).toBeUndefined();
  });

  it("zorlama açık: bir hesaba bakış düşülür, kalan serbest kalır", async () => {
    const { credits, written, closing } = await runOnboarding("probe", {}, { reserved: 10 });
    expect(closing?.status).toBe("succeeded");
    expect(credits.settled).toMatchObject([{ actual: 8, units: { account_scan: 1 } }]);
    expect(written?.credits).toMatchObject({ reserved: 10, due: 8, charged: 8 });
  });

  it("ayrılan kredi bir bakışa yetmiyorsa iş hiç başlamaz: blocked + insufficient_credits, ücretli çağrı yok", async () => {
    const { deps, closing, credits } = await runOnboarding("probe", {}, { reserved: 5 });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });
    expect(deps.verifyAccount).not.toHaveBeenCalled();
    expect(deps.collect).not.toHaveBeenCalled();
    expect(credits.released).toHaveLength(1);
  });

  it("hesap durduysa (gizli) kredi düşülmez: ayırma bırakılır", async () => {
    const { credits } = await runOnboarding("probe", {}, { reserved: 10, deps: { verifyAccount: async () => verified({ outcome: "private", profile: undefined }) } });
    expect(credits.settled).toEqual([]);
    expect(credits.released).toHaveLength(1);
  });
});
