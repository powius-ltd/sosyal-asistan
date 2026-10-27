import { describe, expect, it } from "vitest";

import { JOB_ESTIMATE_LINES_MAX, jobResultSchema, jobStepSchema } from "@/lib/data/job-schema";
import { JOB_OUTCOME_CODES, type JobOutcomeCode, type JobStatus, type JobStepStatus } from "@/lib/domain/panel-job";
import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import { cleanStep } from "@/lib/job-runner/job-session";
import { analyzeVerdict, briefingVerdict, buildFinal, collectVerdict, discoverVerdict, estimateOf, labelVerdict, measureVerdict, planVerdict, probeCollectVerdict, routineFinal, verifyVerdict, type JobVerdict } from "@/lib/job-runner/outcome-map";
import { collected, discovered, verified } from "@/lib/job-runner/run-onboarding-test-support";
import { analyzeSummary, collectSummary, labelSummary, measureResult, planResult } from "@/lib/job-runner/test-support";

type Row = [name: string, verdict: JobVerdict, status: JobStatus, outcome: JobOutcomeCode | undefined, step: JobStepStatus];

const completedCollect = collectSummary({ maxUsd: 0.2 });
const failedCollect = { ...completedCollect, targets: [{ handle: "test.hesap", kind: "own" as const, content: { parsed: 0, ingested: 0, snapshots: 0, notItems: 0, skipped: 0, error: "zaman aşımı" } }] };
const briefingOk: BriefingRunResult = { ok: true, briefingId: "b", runId: "r", items: [], basis: {} as never, attempts: 1, seconds: 12, factsBytes: 1, omitted: {} };
const refused = { allowed: false as const, reason: "Tahmin onaylı tutarı aşıyor." };

const TABLE: Row[] = [
  // Toplama (collect:now): engellendi / hesap yok → çıkış 2
  ["collect · önizleme", collectVerdict(collectSummary({ dryRun: true, maxUsd: 2 })), "succeeded", undefined, "ok"],
  ["collect · hesap yok", collectVerdict({ outcome: "no_targets", targets: [], runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] }), "blocked", "no_targets", "skipped"],
  ["collect · tahmin onaylı tutarı aşıyor", collectVerdict(collectSummary({ maxUsd: 0.05 })), "blocked", "over_approved_amount", "needs_approval"],
  ["collect · tamam", collectVerdict(completedCollect), "succeeded", undefined, "ok"],
  ["collect · düşen hedef", collectVerdict(failedCollect), "partial", "step_failed", "failed"],
  // Ölçüm (measure:now): ölçülecek yok → çıkış 0; ret → çıkış 2
  ["measure · ölçülecek video yok", measureVerdict(measureResult({ outcome: "no_reels", reelCount: 0, jobs: [], estimateUsd: undefined }), undefined), "succeeded", "no_reels", "skipped"],
  ["measure · hesap yok", measureVerdict(measureResult({ outcome: "no_targets", jobs: [], estimateUsd: undefined }), undefined), "succeeded", "no_targets", "skipped"],
  ["measure · önizleme", measureVerdict(measureResult(), undefined), "succeeded", undefined, "ok"],
  ["measure · önizlemede ret hüküm değildir", measureVerdict(measureResult({ outcome: "refused", decision: refused }), undefined), "succeeded", undefined, "ok"],
  ["measure · tutar yetmiyor (tek seferlik)", measureVerdict(measureResult({ outcome: "refused", dryRun: false, decision: refused }), "one_time"), "blocked", "over_approved_amount", "needs_approval"],
  ["measure · aylık tavan izin vermiyor", measureVerdict(measureResult({ outcome: "refused", dryRun: false, decision: refused }), "monthly_cap"), "blocked", "budget_refused", "needs_approval"],
  ["measure · koşu tavanı aştı", measureVerdict(measureResult({ outcome: "blocked", dryRun: false, collect: collectSummary({ maxUsd: 0.01 }) }), "one_time"), "blocked", "over_approved_amount", "needs_approval"],
  ["measure · tamam", measureVerdict(measureResult({ outcome: "completed", dryRun: false, collect: completedCollect }), "one_time"), "succeeded", undefined, "ok"],
  ["measure · düşen hedef", measureVerdict(measureResult({ outcome: "completed", dryRun: false, collect: failedCollect }), "one_time"), "partial", "step_failed", "failed"],
  // Video inceleme (analyze:now): adres yok / arka uç yok → çıkış 2
  ["analyze · iş yok", analyzeVerdict(analyzeSummary({ outcome: "nothing_to_do", selected: 0, ok: 0 })), "succeeded", "nothing_to_do", "skipped"],
  ["analyze · yeniden toplama gerekli", analyzeVerdict(analyzeSummary({ outcome: "needs_recollect", ok: 0, expired: 3 })), "blocked", "needs_recollect", "needs_approval"],
  ["analyze · arka uç yok", analyzeVerdict(analyzeSummary({ outcome: "backend_unavailable", ok: 0 })), "blocked", "backend_unavailable", "failed"],
  ["analyze · tamam", analyzeVerdict(analyzeSummary()), "succeeded", undefined, "ok"],
  ["analyze · bir kısmı düştü", analyzeVerdict(analyzeSummary({ ok: 2, failed: 1 })), "succeeded", undefined, "ok"],
  ["analyze · hepsi düştü", analyzeVerdict(analyzeSummary({ ok: 0, failed: 3 })), "failed", "step_failed", "failed"],
  // Açı etiketleme (label:angles)
  ["label · hesap türü uygulamıyor", labelVerdict(labelSummary({ outcome: "skipped_account_type", selected: 0, labeled: 0 }), false), "succeeded", "skipped_account_type", "skipped"],
  ["label · iş yok", labelVerdict(labelSummary({ outcome: "nothing_to_do", selected: 0, labeled: 0 }), false), "succeeded", "nothing_to_do", "skipped"],
  ["label · tamam", labelVerdict(labelSummary(), false), "succeeded", undefined, "ok"],
  ["label · düşen parti", labelVerdict(labelSummary({ labeled: 2, failed: 2 }), false), "partial", "step_failed", "failed"],
  ["label · yazı aracı yok", labelVerdict(labelSummary({ labeled: 0, failed: 4 }), true), "blocked", "llm_unavailable", "failed"],
  // Plan (plan:week): ses yetersiz → çıkış 2, mevcut plan korundu → çıkış 3
  ["plan · kaydedildi", planVerdict(planResult()), "succeeded", undefined, "ok"],
  ["plan · ses profili yetersiz", planVerdict(planResult({ outcome: "voice_unusable", status: undefined })), "blocked", "voice_unusable", "skipped"],
  ["plan · mevcut plan korundu", planVerdict(planResult({ outcome: "kept_existing", status: undefined })), "blocked", "kept_existing", "skipped"],
  // Notlar (brief:now)
  ["briefing · tamam", briefingVerdict(briefingOk), "succeeded", undefined, "ok"],
  ["briefing · yazı aracı yok", briefingVerdict({ ok: false, code: "spawn_failed", message: "claude yok", persistent: true, seconds: 1 }), "blocked", "llm_unavailable", "failed"],
  ["briefing · doğrulama geçmedi", briefingVerdict({ ok: false, code: "invalid_output", message: "şema", persistent: false, seconds: 1 }), "failed", "step_failed", "failed"],
  // Başlangıç işi · hesap doğrulama
  ["verify · hesap açık", verifyVerdict(verified()), "succeeded", undefined, "ok"],
  ["verify · gizli", verifyVerdict(verified({ outcome: "private", profile: undefined })), "blocked", "account_private", "failed"],
  ["verify · bulunamadı", verifyVerdict(verified({ outcome: "not_found", profile: undefined })), "blocked", "account_not_found", "failed"],
  ["verify · kendi hesap yok", verifyVerdict(verified({ outcome: "no_account", profile: undefined })), "blocked", "no_targets", "failed"],
  ["verify · tahmin tavanı aşıyor", verifyVerdict(verified({ outcome: "blocked", profile: undefined })), "blocked", "over_approved_amount", "needs_approval"],
  ["verify · koşu hatası", verifyVerdict(verified({ outcome: "error", profile: undefined, reason: "ağ" })), "failed", "step_failed", "failed"],
  // Başlangıç işi · kendi videolar
  ["probe collect · tamam", probeCollectVerdict(collected(25)), "succeeded", undefined, "ok"],
  ["probe collect · az video", probeCollectVerdict(collected(4)), "succeeded", "few_videos", "ok"],
  ["probe collect · video yok", probeCollectVerdict(collected(0)), "blocked", "no_videos", "failed"],
  ["probe collect · hesap gizlenmiş", probeCollectVerdict(collected({ profile: { state: "private" } })), "blocked", "account_private", "failed"],
  ["probe collect · hesap kaldırılmış", probeCollectVerdict(collected({ profile: { state: "not_found" } })), "blocked", "account_not_found", "failed"],
  ["probe collect · koşu yapılmadı", probeCollectVerdict(collected({ profile: { state: "ok" } })), "failed", "step_failed", "failed"],
  ["probe collect · tavan aşımı", probeCollectVerdict(collectSummary({ maxUsd: 0.05 })), "blocked", "over_approved_amount", "needs_approval"],
];

describe("özet → iş durumu + sonuç kodu (tablo)", () => {
  it.each(TABLE)("%s", (_name, verdict, status, outcome, step) => {
    expect(verdict.final.status).toBe(status);
    expect(verdict.final.result?.outcome).toBe(outcome);
    expect(verdict.step.status).toBe(step);
    // Kod yalnız bilinen listeden; adım ve sonuç satıra yazma sözleşmesine uyar.
    if (verdict.step.code !== undefined) expect(JOB_OUTCOME_CODES).toContain(verdict.step.code);
    expect(jobStepSchema.safeParse(cleanStep({ id: "collect", ...verdict.step })).success).toBe(true);
    expect(jobResultSchema.safeParse(JSON.parse(JSON.stringify(verdict.final.result ?? {}))).success).toBe(true);
  });

  it("durdu / kısmi / başarısız işte sonuç kodu hep var (ekran cümleyi koddan kurar)", () => {
    for (const [name, verdict] of TABLE) {
      if (verdict.final.status !== "succeeded") expect(verdict.final.result?.outcome, name).toBeDefined();
    }
  });

  it("haftalık tur: çıkış 0 → succeeded · 4 → partial + step_failed · 1 → failed + precheck_failed", () => {
    expect(routineFinal({ exitCode: 0 }, { reportPath: "docs/rutin/test/2026-10-05.md" })).toEqual({ status: "succeeded", result: { exitCode: 0, reportPath: "docs/rutin/test/2026-10-05.md" } });
    expect(routineFinal({ exitCode: 4 })).toEqual({ status: "partial", result: { outcome: "step_failed", exitCode: 4 } });
    expect(routineFinal({ exitCode: 1 })).toEqual({ status: "failed", result: { outcome: "precheck_failed", exitCode: 1 } });
  });
});

describe("başlangıç işi: kapanış", () => {
  it("video sayısı yalnız toplama koştuysa vardır (0 gerçek sıfırdır, bilinmeyen yoktur)", () => {
    expect(probeCollectVerdict(collected(0)).videoCount).toBe(0);
    expect(probeCollectVerdict(collected(12)).videoCount).toBe(12);
    expect(probeCollectVerdict(collectSummary({ maxUsd: 0.05 })).videoCount).toBeUndefined();
    expect(probeCollectVerdict(collected({ profile: { state: "private" } })).videoCount).toBeUndefined();
  });

  it("keşif: aday çıkmaması hata değildir; desteklenmeyen platformda adım atlanır", () => {
    expect(discoverVerdict(discovered({ written: 0, candidates: { total: 0 } })).status).toBe("ok");
    expect(discoverVerdict(discovered({ outcome: "unsupported", notes: ["Platform modülü yok."] }))).toMatchObject({ status: "skipped", note: "Platform modülü yok." });
    expect(jobStepSchema.safeParse(cleanStep({ id: "discover", ...discoverVerdict(discovered()) })).success).toBe(true);
  });

  it("ilk tur: plan hazır → tamam / kısmi; plan yok → plan_not_ready; hiçbir şey üretilmedi → failed (yazı aracı yoksa blocked)", () => {
    const tally = { planReady: true, anyFailed: false, produced: true, llmDown: false };
    expect(buildFinal(tally, { reservedUsd: 0.27 })).toEqual({ status: "succeeded", result: { spend: { reservedUsd: 0.27 } } });
    expect(buildFinal({ ...tally, anyFailed: true }, undefined)).toEqual({ status: "partial", result: { outcome: "step_failed" } });
    expect(buildFinal({ ...tally, planReady: false }, undefined)).toEqual({ status: "partial", result: { outcome: "plan_not_ready" } });
    expect(buildFinal({ ...tally, planReady: false, llmDown: true }, undefined), "veri üretildiyse kalan iş haftalık tura kalır").toMatchObject({ status: "partial", result: { outcome: "plan_not_ready" } });
    expect(buildFinal({ planReady: false, anyFailed: true, produced: false, llmDown: false }, undefined)).toMatchObject({ status: "failed", result: { outcome: "step_failed" } });
    expect(buildFinal({ planReady: false, anyFailed: true, produced: false, llmDown: true }, undefined)).toMatchObject({ status: "blocked", result: { outcome: "llm_unavailable" } });
  });
});

describe("tahmin ve harcama", () => {
  it("önizleme tahmini sonuca girer; para harcanmamıştır (spend yok)", () => {
    const { final, step } = collectVerdict(collectSummary({ dryRun: true, maxUsd: 2 }, 0.13));
    expect(final.result?.estimate).toEqual({ usd: 0.13, lines: [{ label: "profil (2 hesap)", usd: 0.01 }, { label: "@test.hesap", usd: 0.12 }], units: { accounts: 2 } });
    expect(final.result?.spend).toBeUndefined();
    expect(step.spend).toEqual({ estimateUsd: 0.13 });
  });

  it("kredi tahmininin girdisi: toplamada ayrık hesap sayısı (profil koşusu ve reel koşusu aynı hesabı iki kez saymaz)", () => {
    const units = collectVerdict(collectSummary({ dryRun: true, maxUsd: 2 })).final.result?.estimate?.units;
    expect(units).toEqual({ accounts: 2 });
    expect(estimateOf(0.1, [{ label: "@a" }], { accounts: 3 }).units).toEqual({ accounts: 3 });
    expect(estimateOf(0.1, [{ label: "@a" }]).units, "birim bilinmiyorsa alan hiç yok (0 değil)").toBeUndefined();
  });

  it("ölçüm önizlemesi: ölçülecek hesap sayısı birim olarak yazılır; sayı yoksa alan yok", () => {
    expect(measureVerdict(measureResult({ accountCount: 2 }), undefined).final.result?.estimate?.units).toEqual({ measureRuns: 2 });
    expect(measureVerdict(measureResult({ accountCount: undefined }), undefined).final.result?.estimate?.units).toBeUndefined();
  });

  it("gerçek toplama: rezerve ve gerçek tutar sonuca girer; mutabakat bekleyen tutar yazılmaz (0 değil)", () => {
    expect(collectVerdict(completedCollect).final.result?.spend).toEqual({ reservedUsd: 0.11, actualUsd: 0.1 });
    const pending = { ...completedCollect, cost: { reservedUsd: 0.11, pendingReconcile: 1 } };
    expect(collectVerdict(pending).final.result?.spend).toEqual({ reservedUsd: 0.11 });
    expect(cleanStep({ id: "collect", ...collectVerdict(pending).step }).spend).toEqual({ estimateUsd: 0.11 });
  });

  it("fiyatı okunamayan tahminde tutar yok (0 değil); döküm sınırı aşılırsa fazlası tek satırda toplanır", () => {
    expect(estimateOf(undefined, [{ label: "@a" }])).toEqual({ lines: [{ label: "@a" }] });
    const many = Array.from({ length: JOB_ESTIMATE_LINES_MAX + 5 }, (_, i) => ({ label: `@hesap${i}`, usd: 0.01 }));
    const estimate = estimateOf(0.65, many);
    expect(estimate.lines).toHaveLength(JOB_ESTIMATE_LINES_MAX);
    expect(estimate.lines.at(-1)?.label).toContain("diğer 6 koşu");
    expect(estimate.lines.reduce((sum, line) => sum + (line.usd ?? 0), 0)).toBeCloseTo(0.65);
    expect(jobResultSchema.safeParse({ estimate }).success).toBe(true);
  });
});
