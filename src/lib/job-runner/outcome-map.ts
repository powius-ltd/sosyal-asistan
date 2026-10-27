/**
 * Özet → iş sonucu (SAF eşleme): mevcut `runX` özetlerini panel işinin durumuna, sonuç KODUNA ve adım sonucuna çevirir. Adımın durumu ve
 * notu `orchestrator/step-outputs.ts` eşlemelerinden gelir (kopya yazılmaz); burada yalnız KOD ve İŞ DURUMU eklenir. Ekran cümleyi koddan
 * kurar (`plain-language.ts`); not yalnız yöneticiye görünür.
 *
 * Kural (betiklerin çıkış kodlarıyla aynı): çıkış 0 → `succeeded` · betiğin "durdu" (2/3) hâlleri → `blocked` + kod · bir kısmı yapılıp
 * bir kısmı düşen iş (haftalık turda çıkış 4, toplamada / etiketlemede düşen parça) → `partial` + `step_failed` · hiçbir şey yapılamayan
 * iş → `failed`. Yazı aracı kalıcı olarak kullanılamıyorsa (oturum yok / limit) iş `blocked` + `llm_unavailable` (video aracındaki
 * `backend_unavailable` ile aynı sınıf). Tasarım gereği atlama (iş yok, hesap türü) başarıdır; kodu nedenini söyler.
 */
import "server-only";

import { plannedAccountCount } from "@/lib/collection/plan-targets";
import type { DiscoverSummary } from "@/lib/collection/discover";
import type { AccountVerification } from "@/lib/collection/discover-account";
import { classifyAccessReason } from "@/lib/collection/profile-rows";
import type { CollectPlan, CollectSummary } from "@/lib/collection/types";
import { JOB_ESTIMATE_LINES_MAX } from "@/lib/data/job-schema";
import type { CreditUnits } from "@/lib/domain/credit-pricing";
import { ONBOARDING_LOW_DATA_VIDEOS } from "@/lib/domain/onboarding-job";
import type { JobEstimate, JobEstimateLine, JobOutcomeCode, JobResult, JobStep } from "@/lib/domain/panel-job";
import { formatNumber, formatUsd } from "@/lib/format";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import type { LabelSummary } from "@/lib/intel/label-run";
import type { PlanRunResult } from "@/lib/intel/plan-run";
import type { JobFinal } from "@/lib/job-runner/job-session";
import { analyzeOutput, collectOutput, labelOutput, planOutput } from "@/lib/orchestrator/step-outputs";
import type { RoutineReport, StepOutput } from "@/lib/orchestrator/types";
import type { MeasureResult } from "@/lib/outcomes/measure-run";
import { truncateText } from "@/lib/text";

/** Adımın kapanışı (süre çağıranda eklenir). */
export type StepVerdict = Pick<JobStep, "status" | "code" | "note" | "spend">;

/** Tek adımlı işin hükmü: adım + işin kapanışı. */
export interface JobVerdict {
  step: StepVerdict;
  final: JobFinal;
}

const ESTIMATE_LABEL_MAX = 120;
const n = (value: number) => formatNumber(value) ?? "0";
const usd = (value: number | undefined) => formatUsd(value) ?? "—";

/** `StepOutput` → adım kapanışı: neden + notlar tek satır nota iner (sınırı oturum kırpar). */
export function stepOfOutput(output: StepOutput, code?: JobOutcomeCode): StepVerdict {
  const note = [output.reason, ...(output.notes ?? [])].join(" · ");
  return { status: output.status, ...(code === undefined ? {} : { code }), note, ...(output.spend === undefined ? {} : { spend: output.spend }) };
}

/** Tahmin dökümü: en çok `JOB_ESTIMATE_LINES_MAX` satır; fazlası tek "diğer" satırında toplanır (toplam değişmez). */
export function estimateOf(usdTotal: number | undefined, jobs: readonly { label: string; usd?: number }[], units?: CreditUnits): JobEstimate {
  const line = (job: { label: string; usd?: number }): JobEstimateLine => ({
    label: truncateText(job.label, ESTIMATE_LABEL_MAX) || "koşu",
    ...(job.usd === undefined || !Number.isFinite(job.usd) ? {} : { usd: Math.max(0, job.usd) }),
  });
  const head = jobs.length > JOB_ESTIMATE_LINES_MAX ? jobs.slice(0, JOB_ESTIMATE_LINES_MAX - 1) : jobs;
  const rest = jobs.slice(head.length);
  const lines = head.map(line);
  if (rest.length > 0) lines.push({ label: `diğer ${n(rest.length)} koşu`, usd: rest.reduce((sum, job) => sum + (job.usd ?? 0), 0) });
  return { ...(usdTotal === undefined || !Number.isFinite(usdTotal) ? {} : { usd: Math.max(0, usdTotal) }), lines, ...(units === undefined ? {} : { units }) };
}

const collectEstimate = (plan: CollectPlan): JobEstimate =>
  estimateOf(plan.estimatedUsd, plan.jobs.map((job) => ({ label: job.label, usd: job.estimatedUsd })), { accounts: plannedAccountCount(plan) });

function collectSpend(summary: CollectSummary): JobResult["spend"] {
  const { reservedUsd, actualUsd } = summary.cost;
  return { reservedUsd, ...(actualUsd === undefined ? {} : { actualUsd }) };
}

/** Toplama (`collect:now`): engellendi / hesap yok → durdu (çıkış 2); düşen hedef ya da skor → kısmi. */
export function collectVerdict(summary: CollectSummary): JobVerdict {
  const output = collectOutput(summary);
  const estimate = summary.plan === undefined ? undefined : collectEstimate(summary.plan);
  const withEstimate = (result: JobResult): JobResult => ({ ...result, ...(estimate === undefined ? {} : { estimate }) });
  if (summary.outcome === "no_targets") return { step: stepOfOutput(output, "no_targets"), final: { status: "blocked", result: { outcome: "no_targets", exitCode: 2 } } };
  if (summary.outcome === "dry_run") {
    const unknown = summary.plan?.priceUnknown ? " En az bir fiyat okunamadı: tahmin temkinli varsayımdan." : "";
    const note = `Önizleme: ${n(summary.plan?.jobs.length ?? 0)} koşu, tahmini toplam ${usd(summary.plan?.estimatedUsd)}. Hiçbir koşu başlatılmadı, para harcanmadı.${unknown}`;
    return { step: { status: "ok", note, spend: { estimateUsd: summary.plan?.estimatedUsd } }, final: { status: "succeeded", result: withEstimate({ exitCode: 0 }) } };
  }
  if (summary.outcome === "blocked") {
    return { step: stepOfOutput(output, "over_approved_amount"), final: { status: "blocked", result: withEstimate({ outcome: "over_approved_amount", exitCode: 2 }) } };
  }
  const spend = collectSpend(summary);
  if (output.status === "failed") return { step: stepOfOutput(output, "step_failed"), final: { status: "partial", result: withEstimate({ outcome: "step_failed", exitCode: 1, spend }) } };
  return { step: stepOfOutput(output), final: { status: "succeeded", result: withEstimate({ exitCode: 0, spend }) } };
}

/**
 * Ölçüm (`measure:now`). Önizlemede onay kuralının sonucu hüküm değildir (tahmin yine verilir; not yöneticiye söyler). Gerçek koşuda ret:
 * tek seferlik tutar aşılıyorsa `over_approved_amount`, aylık ölçüm tavanı izin vermiyorsa `budget_refused`.
 */
export function measureVerdict(result: MeasureResult, basis: "one_time" | "monthly_cap" | undefined): JobVerdict {
  if (result.outcome === "no_reels") {
    return { step: { status: "skipped", code: "no_reels", note: "Ölçülecek Reels yok: Apify'a gidilmedi, harcama $0." }, final: { status: "succeeded", result: { outcome: "no_reels", exitCode: 0 } } };
  }
  if (result.outcome === "no_targets") {
    return { step: { status: "skipped", code: "no_targets", note: ["Ölçülecek kendi hesap yok, harcama $0.", ...result.notes].join(" · ") }, final: { status: "succeeded", result: { outcome: "no_targets", exitCode: 0 } } };
  }
  const estimate = estimateOf(result.estimateUsd, result.jobs, result.accountCount === undefined ? undefined : { measureRuns: result.accountCount });
  const spend = { estimateUsd: result.estimateUsd };
  const decision = result.decision === undefined ? "" : result.decision.allowed ? ` Onay: ${result.decision.note}.` : ` ${result.decision.reason}`;
  if (result.dryRun) {
    const note = `Önizleme: ${n(result.reelCount)} Reels, ${n(result.jobs.length)} koşu, tahmini toplam ${usd(result.estimateUsd)}. Hiçbir koşu başlatılmadı, para harcanmadı.${decision}`;
    return { step: { status: "ok", note, spend }, final: { status: "succeeded", result: { exitCode: 0, estimate } } };
  }
  if (result.outcome === "refused" || result.outcome === "blocked" || result.collect === undefined) {
    const code: JobOutcomeCode = result.outcome === "refused" && basis === "monthly_cap" ? "budget_refused" : "over_approved_amount";
    const note = `Tahmini toplam ${usd(result.estimateUsd)}: HİÇBİR koşu başlamadı.${decision}`;
    return { step: { status: "needs_approval", code, note, spend }, final: { status: "blocked", result: { outcome: code, exitCode: 2, estimate } } };
  }
  const inner = collectVerdict(result.collect);
  return { step: inner.step, final: { ...inner.final, result: { ...inner.final.result, estimate } } };
}

/** Video inceleme (`analyze:now`): adres yok / arka uç yok → durdu (çıkış 2); seçilenlerin hepsi düştüyse başarısız. */
export function analyzeVerdict(summary: AnalyzeSummary): JobVerdict {
  const output = analyzeOutput(summary);
  if (summary.outcome === "nothing_to_do") return { step: stepOfOutput(output, "nothing_to_do"), final: { status: "succeeded", result: { outcome: "nothing_to_do", exitCode: 0 } } };
  if (summary.outcome === "unsupported_platform") {
    return { step: stepOfOutput(output, "analysis_unsupported"), final: { status: "succeeded", result: { outcome: "analysis_unsupported", exitCode: 0 } } };
  }
  if (summary.outcome === "needs_recollect" || summary.outcome === "backend_unavailable") {
    return { step: stepOfOutput(output, summary.outcome), final: { status: "blocked", result: { outcome: summary.outcome, exitCode: 2 } } };
  }
  if (output.status === "failed") return { step: stepOfOutput(output, "step_failed"), final: { status: "failed", result: { outcome: "step_failed", exitCode: 1 } } };
  return { step: stepOfOutput(output), final: { status: "succeeded", result: { exitCode: 0 } } };
}

/** Açı etiketleme (`label:angles`). `tripped`: günlükte kalıcı yazı aracı hatası görüldü (`orchestrator/llm-failure`). */
export function labelVerdict(summary: LabelSummary, tripped: boolean): JobVerdict {
  const output = labelOutput(summary, tripped);
  if (summary.outcome === "skipped_account_type" || summary.outcome === "nothing_to_do") {
    return { step: stepOfOutput(output, summary.outcome), final: { status: "succeeded", result: { outcome: summary.outcome, exitCode: 0 } } };
  }
  if (output.status !== "failed") return { step: stepOfOutput(output), final: { status: "succeeded", result: { exitCode: 0 } } };
  if (tripped) return { step: stepOfOutput(output, "llm_unavailable"), final: { status: "blocked", result: { outcome: "llm_unavailable", exitCode: 2 } } };
  return { step: stepOfOutput(output, "step_failed"), final: { status: "partial", result: { outcome: "step_failed", exitCode: 2 } } };
}

/** Plan (`plan:week`): ses profili yetersiz (çıkış 2) ve mevcut plan korundu (çıkış 3) → durdu. */
export function planVerdict(result: PlanRunResult, markdownPath?: string): JobVerdict {
  const output = planOutput(result, markdownPath);
  if (result.outcome === "voice_unusable") return { step: stepOfOutput(output, "voice_unusable"), final: { status: "blocked", result: { outcome: "voice_unusable", exitCode: 2 } } };
  if (result.outcome === "kept_existing") return { step: stepOfOutput(output, "kept_existing"), final: { status: "blocked", result: { outcome: "kept_existing", exitCode: 3 } } };
  return { step: stepOfOutput(output), final: { status: "succeeded", result: { exitCode: 0 } } };
}

/** Notlar (`brief:now`): kalıcı yazı aracı hatası → durdu; diğer başarısızlık (doğrulama, yazım) → başarısız. Önceki notlar kalır. */
export function briefingVerdict(result: BriefingRunResult): JobVerdict {
  if (result.ok) return { step: { status: "ok", note: `${n(result.items.length)} madde (${n(Math.round(result.seconds))} sn).` }, final: { status: "succeeded", result: { exitCode: 0 } } };
  const note = `${result.code}: ${result.message}`;
  if (result.persistent) return { step: { status: "failed", code: "llm_unavailable", note }, final: { status: "blocked", result: { outcome: "llm_unavailable", exitCode: 1 } } };
  return { step: { status: "failed", code: "step_failed", note }, final: { status: "failed", result: { outcome: "step_failed", exitCode: 1 }, error: note } };
}

/** Haftalık tur (`rutin`) çıkış kodu → iş durumu: 0 tamam · 4 kısmi (en az bir adım düştü) · 1 önkontrol / durum okunamadı. */
export function routineFinal(report: Pick<RoutineReport, "exitCode">, extra: Pick<JobResult, "reportPath" | "spend" | "estimate"> = {}): JobFinal {
  const { exitCode } = report;
  if (exitCode === 0) return { status: "succeeded", result: { exitCode, ...extra } };
  if (exitCode === 4) return { status: "partial", result: { outcome: "step_failed", exitCode, ...extra } };
  return { status: "failed", result: { outcome: "precheck_failed", exitCode, ...extra } };
}

// ------------------------------------------------------------ Başlangıç işi

/**
 * Hesap doğrulama (başlangıç `verify`): gizli / bulunamayan hesap işi DURDURUR (`blocked` + kod; içerik koşusuna para harcanmaz). Tavanı
 * aşan tahmin `over_approved_amount`; koşu / ayrıştırma hatası işi `failed` kapatır (yeniden denenebilir). `ok`'ta `final` kullanılmaz.
 */
export function verifyVerdict(result: AccountVerification): JobVerdict {
  const reason = result.reason ?? "";
  const blocked = (code: JobOutcomeCode, note: string, status: StepVerdict["status"] = "failed"): JobVerdict => ({ step: { status, code, note }, final: { status: "blocked", result: { outcome: code } } });
  switch (result.outcome) {
    case "ok": {
      const followers = result.profile?.followers === undefined ? "takipçi sayısı okunamadı" : `${n(result.profile.followers)} takipçi`;
      return { step: { status: "ok", note: `Hesap açık ve erişilebilir (${followers}).` }, final: { status: "succeeded" } };
    }
    case "private":
      return blocked("account_private", `Hesap gizli: herkese açık veri alınamıyor${reason === "" ? "" : ` (${reason})`}.`);
    case "not_found":
      return blocked("account_not_found", `Hesap bulunamadı${reason === "" ? "" : ` (${reason})`}.`);
    case "no_account":
      return blocked("no_targets", "Çalışma alanında kendi hesap yok: bakılacak hesap bulunamadı.");
    case "blocked":
      return blocked("over_approved_amount", `Hesap doğrulanamadı: ${reason} HİÇBİR koşu başlamadı.`, "needs_approval");
    case "unsupported":
    case "error":
      return { step: { status: "failed", code: "step_failed", note: `Hesap doğrulanamadı: ${reason}` }, final: { status: "failed", result: { outcome: "step_failed" }, error: `Hesap doğrulanamadı: ${reason}` } };
  }
}

/**
 * Başlangıçta kendi videoların toplanması (`probe` `collect`): toplanan kısa video sayısı işin kaderini belirler. 0 video → `no_videos`
 * (iş durur) · `ONBOARDING_LOW_DATA_VIDEOS`'tan az → `few_videos` uyarısıyla sürer · hesap toplama sırasında gizli / erişilemez çıktıysa
 * `account_private` / `account_not_found` · koşu düştüyse `failed` (yeniden denenebilir). `videoCount` toplama koşmadıysa yoktur (0 değil).
 */
export function probeCollectVerdict(summary: CollectSummary): JobVerdict & { videoCount?: number } {
  const base = collectVerdict(summary);
  if (summary.outcome !== "completed") return base; // tavan aşımı / hesap yok: `collectVerdict` zaten `blocked` + kod verir
  const own = summary.targets.find((target) => target.kind === "own");
  const spend = base.final.result?.spend;
  const stopped = (code: JobOutcomeCode, note: string): JobVerdict => ({ step: { ...base.step, status: "failed", code, note }, final: { status: "blocked", result: { outcome: code, spend } } });
  // Doğrulamadan sonra hesap gizlendiyse / kaldırıldıysa profil aşaması söyler; içerik koşusunda yalnız gizlilik hesap durumudur
  // ("içerik yok" hesabın olmadığı anlamına gelmez: o hâl aşağıda `no_videos` olur).
  if (own?.profile?.state === "private" || (own?.content?.accessError !== undefined && classifyAccessReason(own.content.accessError) === "private")) {
    return stopped("account_private", "Hesap gizli: videolar alınamadı.");
  }
  if (own?.profile?.state === "not_found") return stopped("account_not_found", "Hesap bulunamadı: videolar alınamadı.");
  const content = own?.content;
  if (content === undefined || content.error !== undefined || content.skippedReason !== undefined) {
    const why = content?.error ?? content?.skippedReason ?? "kendi hesap için içerik koşusu yapılmadı";
    return { step: { ...base.step, status: "failed", code: "step_failed", note: `Videolar alınamadı: ${why}` }, final: { status: "failed", result: { outcome: "step_failed", spend }, error: `Videolar alınamadı: ${why}` } };
  }
  const videoCount = content.parsed;
  if (videoCount === 0) return { ...stopped("no_videos", "Hesapta kısa video bulunamadı: incelenecek içerik yok."), videoCount };
  if (videoCount < ONBOARDING_LOW_DATA_VIDEOS) {
    return { step: { ...base.step, status: "ok", code: "few_videos", note: `${n(videoCount)} video bulundu (az: sonuçlar düşük güvenli olur). ${base.step.note ?? ""}`.trim() }, final: { status: "succeeded", result: { outcome: "few_videos", spend } }, videoCount };
  }
  return { step: { ...base.step, status: "ok" }, final: { status: "succeeded", result: { spend } }, videoCount };
}

/** Aday keşfi (`probe` `discover`): aday çıkmaması hata değildir (rakipsiz yol geçerlidir). */
export function discoverVerdict(summary: DiscoverSummary): StepVerdict {
  if (summary.outcome !== "completed") return { status: "skipped", note: summary.notes.join(" · ") || "Keşif yapılmadı." };
  const money = `rezerve ${usd(summary.cost.reservedUsd)}, gerçek ${summary.cost.actualUsd === undefined ? "mutabakat bekliyor" : usd(summary.cost.actualUsd)}`;
  const note = [`${n(summary.written)} yeni aday (${n(summary.sources.coauthors.written)} ortak yazar, ${n(summary.sources.search.written)} arama); toplam ${n(summary.candidates.total)} aday (${money}).`, ...summary.notes].join(" · ");
  return { status: "ok", note, spend: { ...(summary.cost.actualUsd === undefined ? {} : { actualUsd: summary.cost.actualUsd }) } };
}

/** İlk turun (`build`) kapanışı için adım özeti. */
export interface BuildTally {
  /** Plan hazır mı (bu turda kaydedildi ya da zaten vardı). */
  planReady: boolean;
  /** En az bir adım başarısız oldu. */
  anyFailed: boolean;
  /** Tur veri üretti mi (hesap tarandı ya da video incelendi): üretmediyse iş `failed` kapanır ve yeniden başlatılabilir. */
  produced: boolean;
  /** Yazı aracı kalıcı olarak kullanılamadı. */
  llmDown: boolean;
}

/**
 * İlk tur (`build`) → iş durumu. Plan hazır + hata yok → `succeeded` · plan hazır ama bir adım düştü → `partial` + `step_failed` · plan
 * çıkmadı ama veri üretildi → `partial` + `plan_not_ready` (kalan iş onaysız haftalık turla sürer) · hiçbir şey üretilmedi → `failed`
 * (yazı aracı yoksa `blocked` + `llm_unavailable`): hesap başına tek ilk tur hakkı boş koşuyla harcanmaz.
 */
export function buildFinal(tally: BuildTally, spend: JobResult["spend"]): JobFinal {
  const result = (outcome?: JobOutcomeCode): JobResult => ({ ...(outcome === undefined ? {} : { outcome }), ...(spend === undefined ? {} : { spend }) });
  if (tally.planReady) return tally.anyFailed ? { status: "partial", result: result("step_failed") } : { status: "succeeded", result: result() };
  if (tally.produced) return { status: "partial", result: result("plan_not_ready") };
  if (tally.llmDown) return { status: "blocked", result: result("llm_unavailable"), error: "Yazı aracı kullanılamıyor: ilk tur hiçbir şey üretmedi." };
  return { status: "failed", result: result("step_failed"), error: "İlk tur hiçbir şey üretemedi: adım notlarına bak." };
}
