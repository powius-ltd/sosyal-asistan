/**
 * Rutin raporu (saf: dosya/DB yok): konsol özeti, `docs/rutin/<tarih>.md` içeriği ve `system` bildirimi taslağı.
 * Adım başına `ok / skipped / failed / needs_approval` + sebep + süre; para harcayan adımda tahmin/gerçek (bilinmeyen "—", 0 değil).
 * Gizli değer yazılmaz: adaptörler yalnız Türkçe sebep metni ve sayı verir.
 */
import { accountTypeLabel, accountTypeProfile } from "@/lib/domain/account-type";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import {
  SPENDING_STEPS,
  STEP_COMMAND,
  STEP_TITLE,
  type PlanEntry,
  type RoutineReport,
  type RoutineState,
  type RoutineStepId,
  type StepResult,
  type StepStatus,
} from "@/lib/orchestrator/types";

const dash = (value: string | undefined) => value ?? "—";
const usd = (amount: number | undefined) => dash(formatUsd(amount));
const when = (iso: string | undefined) => dash(formatDateTime(iso));

const MATRIX_KIND_LABEL = { angle_funnel: "açı × farkındalık", topic_hook: "konu × hook" } as const;

const ACTION_LABEL: Record<PlanEntry["decision"]["action"], string> = { run: "çalışacak", skip: "atlanacak", needs_approval: "onay bekliyor" };

/** Durum satırları (kuru koşu ve rapor ortak). */
export function stateLines(state: RoutineState): string[] {
  const { collection, analysis, labeling, clustering, plan, measurement, briefing } = state;
  const profile = accountTypeProfile(state.accountType);
  const planLine = plan.exists ? `var (${dash(plan.status)}, ${formatNumber(plan.plannedCount) ?? "?"} öğe)` : "yok";
  const briefingLine = briefing.generatedAt === undefined ? "yok" : `${when(briefing.generatedAt)}${briefing.freshness?.stale ? ` (bayat: ${briefing.freshness.reason})` : " (taze)"}`;
  const matrices = profile.matrices.map((kind) => MATRIX_KIND_LABEL[kind]).join(" + ");
  const bound = clustering.available ? "bağlı" : "bağlı değil";
  const clusterLine = !profile.matrices.includes("topic_hook")
    ? "Konu kümeleri: bu tür konu × hook matrisi kullanmaz"
    : clustering.clusteredCount === undefined
      ? `Konu kümeleri: durum okunamadı · kümeleme adımı ${bound}`
      : `Konu kümeleri: ${formatNumber(clustering.clusteredCount)} video kümeli, ${formatNumber(clustering.unclusteredCount)} kümesiz · kümeleme adımı ${bound}`;
  return [
    `Hesap türü: ${accountTypeLabel(state.accountType)} (matris: ${matrices} · açı etiketlemesi: ${profile.appliesAngleLabeling ? "var" : "yok"})`,
    clusterLine,
    `Hedef plan haftası: ${state.planWeek} · plan: ${planLine}`,
    `Apify: ${state.apifyMaxUsd === undefined ? "onay YOK (--apify-max verilmedi)" : `onaylı tavan ${usd(state.apifyMaxUsd)}`} · son toplama ${when(collection.lastCollectedAt)} · geçmiş referans ${usd(collection.referenceUsd)}`,
    `Analizsiz seçilebilir video: ${formatNumber(analysis.selectable)} · etiketlenecek video: ${formatNumber(labeling.eligible)} · brifingten sonra yeni içerik: ${formatNumber(collection.newContentSinceBriefing)}`,
    `Ölçümü gelen Reels: ${formatNumber(measurement.dueCount)} (ölçüm tavanı ${measurement.capApproved ? "onaylı" : "ONAYSIZ"}) · brifing: ${briefingLine}`,
  ];
}

export function decisionLines(plan: readonly PlanEntry[]): string[] {
  return plan.map(({ step, decision }) => {
    const estimate = decision.action === "needs_approval" && decision.estimateUsd !== undefined ? ` [referans ${usd(decision.estimateUsd)}]` : "";
    return `${STEP_TITLE[step]}: ${ACTION_LABEL[decision.action]}${estimate} — ${decision.reason}`;
  });
}

const STATUS_LABEL: Record<StepStatus, string> = { ok: "ok", skipped: "skipped", failed: "failed", needs_approval: "needs_approval" };

function spendText(step: StepResult): string | undefined {
  if (!SPENDING_STEPS.includes(step.step as RoutineStepId) || step.spend === undefined) return undefined;
  return `tahmin ${usd(step.spend.estimateUsd)}, gerçek ${usd(step.spend.actualUsd)}`;
}

/** Konsol özeti: kuru koşuda durum + kararlar, gerçek koşuda adım sonuçları. */
export function summaryLines(report: RoutineReport): string[] {
  const lines: string[] = [];
  if (report.state) lines.push("Durum:", ...stateLines(report.state).map((l) => `  ${l}`));
  if (report.dryRun && report.plan) lines.push("", "Adım kararları (DRY-RUN: hiçbir LLM/Apify/yazma yapılmadı):", ...decisionLines(report.plan).map((l) => `  ${l}`));
  if (!report.dryRun) {
    lines.push("", "Adım sonuçları:");
    for (const step of report.steps) {
      const spend = spendText(step);
      lines.push(`  ${STEP_TITLE[step.step]}: ${STATUS_LABEL[step.status]} (${step.seconds} sn) — ${step.reason}${spend ? ` [${spend}]` : ""}`);
    }
  }
  lines.push("", `Çıkış kodu: ${report.exitCode}`);
  return lines;
}

function approvalLines(report: RoutineReport): string[] {
  return report.steps
    .filter((s) => s.status === "needs_approval")
    .map((s) => {
      const command = s.step === "precheck" ? undefined : STEP_COMMAND[s.step];
      return `- ${STEP_TITLE[s.step]}: ${s.reason}${command ? ` (\`${command}\`)` : ""}`;
    });
}

/** `docs/rutin/<tarih>.md` (gitignore'da). Tek tablo + notlar; tekrar/dolgu yok. */
export function renderRoutineMarkdown(report: RoutineReport): string {
  const out: string[] = [`# Haftalık rutin — ${when(report.startedAt)}`, "", `Çıkış kodu: **${report.exitCode}** (0 tamam · 4 kısmi · 1 önkontrol)`, ""];
  if (report.state) out.push("## Durum", "", ...stateLines(report.state).map((l) => `- ${l}`), "");
  out.push("## Adımlar", "", "| Adım | Durum | Süre | Sebep |", "|---|---|---|---|");
  for (const step of report.steps) {
    const spend = spendText(step);
    out.push(`| ${STEP_TITLE[step.step]} | ${STATUS_LABEL[step.status]} | ${step.seconds} sn | ${step.reason.replace(/\|/g, "/")}${spend ? ` (${spend})` : ""} |`);
  }
  const approvals = approvalLines(report);
  if (approvals.length > 0) out.push("", "## Onay bekleyenler", "", ...approvals);
  const noted = report.steps.filter((s) => (s.notes?.length ?? 0) > 0);
  if (noted.length > 0) {
    out.push("", "## Notlar", "");
    for (const step of noted) out.push(`**${STEP_TITLE[step.step]}**`, ...(step.notes ?? []).map((n) => `- ${n}`), "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export interface RoutineNotificationDraft {
  title: string;
  body: string;
  dedupeKey: string;
}

/** `system` bildirimi: tek satır sonuç + onay bekleyenler. Aynı hafta için bir kez (`routine:<hafta>`). */
export function routineNotification(report: RoutineReport, weekKey: string): RoutineNotificationDraft {
  const failed = report.steps.filter((s) => s.status === "failed");
  const waiting = report.steps.filter((s) => s.status === "needs_approval");
  const title =
    report.exitCode === 1 ? "Haftalık rutin durdu (önkontrol)" : failed.length > 0 ? `Haftalık rutin kısmen tamamlandı (${failed.length} adım başarısız)` : "Haftalık rutin tamamlandı";
  const parts = [
    ...failed.map((s) => `Başarısız: ${STEP_TITLE[s.step]} — ${s.reason}`),
    ...waiting.map((s) => `Onay bekliyor: ${STEP_TITLE[s.step]}`),
  ];
  const body = parts.length > 0 ? parts.join("\n") : "Tüm adımlar tamamlandı ya da tasarım gereği atlandı. Ayrıntı: docs/rutin.";
  return { title, body, dedupeKey: `routine:${weekKey}` };
}
