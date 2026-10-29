/**
 * Halka durumunu olgulardan türetir (SAF; veritabanı yok). Sıra: hesap · rakip · topla · analiz · etiket · plan · fiş · paylaş · ölç · öğren.
 * Para harcayan adım (`collect`, `discover`) yapılacaksa `needs_approval`, $0 adım `due` olur; önkoşulu eksik adım `blocked` (neden yazılı).
 */
import { appliesAngleLabeling } from "@/lib/domain/account-type";
import { JOB_KIND_SPEC, type JobKind } from "@/lib/domain/panel-job";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { CYCLE_STEP_IDS, type CycleFacts, type CycleLastJob, type CycleState, type CycleStep, type CycleStepId } from "@/lib/cycle/types";
import { DAY_MS } from "@/lib/time";

/** Adımın son işini arayan iş türleri (yeniden eskiye ilk eşleşen). */
const STEP_JOB_KINDS: Partial<Record<CycleStepId, readonly JobKind[]>> = {
  account: ["onboarding"],
  rivals: ["discover", "onboarding"],
  collect: ["collect", "routine", "onboarding"],
  analyze: ["analyze", "routine", "onboarding"],
  label: ["label", "routine", "onboarding"],
  plan: ["plan", "routine", "onboarding"],
  share: ["publish", "order_return"],
  measure: ["measure_zernio", "measure"],
};

const NOT_BUILT: Partial<Record<CycleStepId, string>> = {
  slip: "Çekim fişi (video başına çekim notu) için kod henüz yok.",
  learn: "Sonuçtan öğrenip planı düzelten adım henüz yok.",
};

const ageDays = (iso: string, now: Date): number => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
const n = (value: number): string => String(value);

function lastJobOf(id: CycleStepId, jobs: readonly CycleLastJob[]): CycleLastJob | undefined {
  const kinds = STEP_JOB_KINDS[id];
  return kinds === undefined ? undefined : jobs.find((job) => kinds.includes(job.kind));
}

type Verdict = Pick<CycleStep, "status" | "reason" | "jobKind">;

/** Adımın durumu; önceki adımların sonucu (`done` kümesi) önkoşul olarak okunur. */
function verdictOf(id: CycleStepId, facts: CycleFacts, now: Date, earlierDone: ReadonlySet<CycleStepId>): Verdict {
  const rules = CYCLE_RULES;
  switch (id) {
    case "account":
      return facts.ownAccounts > 0 ? { status: "done", reason: "Kendi hesap bağlı." } : { status: "due", reason: "Kendi hesap henüz eklenmemiş.", jobKind: "onboarding" };
    case "rivals": {
      const target = facts.rivalTarget ?? 1;
      if (facts.trackedRivals >= target && (facts.trackedRivals > 0 || target === 0)) return { status: "done", reason: `${n(facts.trackedRivals)} rakip izleniyor${facts.rivalTarget === undefined ? "" : ` (hedef ${n(target)})`}.` };
      if (facts.trackedRivals === 0 && (rules.rivallessAccountTypes as readonly string[]).includes(facts.accountType)) return { status: "done", reason: "İzlenen rakip yok; bu hesap türünde plan kendi tutanlarından öğrenir." };
      if (!earlierDone.has("account")) return { status: "blocked", reason: "Önce kendi hesap eklenmeli." };
      // Bekleyen aday varsa yeniden aramak yerine seçim beklenir: adayı izlemeye almak insanın kararıdır (ajan seçmez).
      const pending = facts.pendingCandidates ?? 0;
      if (pending > 0) return { status: "blocked", reason: `${n(pending)} rakip adayı hazır; Rakipler'den seçip izlemeye alman gerekiyor (hedef ${n(target)}, şu an ${n(facts.trackedRivals)}).` };
      return {
        status: "needs_approval",
        reason: facts.trackedRivals === 0 ? "İzlenen rakip yok; benzer hesapları aramak para harcar (tutar onayı ister)." : `${n(facts.trackedRivals)}/${n(target)} rakip izleniyor; eksik rakip için benzer hesapları aramak para harcar (tutar onayı ister).`,
        jobKind: "discover",
      };
    }
    case "collect": {
      if (!earlierDone.has("account")) return { status: "blocked", reason: "Önce kendi hesap eklenmeli." };
      if (facts.lastCollectedAt === undefined || facts.contentCount === 0) return { status: "needs_approval", reason: "Henüz içerik toplanmamış; toplama para harcar (tutar onayı ister).", jobKind: "collect" };
      const age = ageDays(facts.lastCollectedAt, now);
      const freshDays = facts.collectEveryDays ?? rules.collectFreshDays;
      return age > freshDays
        ? { status: "needs_approval", reason: `Son toplama ${n(age)} gün önce (eşik ${n(freshDays)} gün); yenisi para harcar.`, jobKind: "collect" }
        : { status: "done", reason: `Son toplama ${n(age)} gün önce; ${n(facts.contentCount)} içerik var.` };
    }
    case "analyze": {
      if (facts.contentCount === 0) return { status: "blocked", reason: "İncelenecek içerik yok; önce toplama gerekir." };
      return facts.pendingAnalysis > 0
        ? { status: "due", reason: `${n(facts.pendingAnalysis)} içerik incelenmeyi bekliyor.`, jobKind: "analyze" }
        : { status: "done", reason: `${n(facts.analyzedCount)} içerik incelenmiş; bekleyen yok.` };
    }
    case "label": {
      if (!appliesAngleLabeling(facts.accountType)) return { status: "done", reason: "Açı etiketleme bu hesap türünde uygulanmaz." };
      if (facts.analyzedCount === 0) return { status: "blocked", reason: "Etiketlenecek incelenmiş içerik yok." };
      return facts.pendingLabels > 0
        ? { status: "due", reason: `${n(facts.pendingLabels)} incelenmiş içerik etiket bekliyor.`, jobKind: "label" }
        : { status: "done", reason: "Etiketlenecek içerik kalmadı." };
    }
    case "plan": {
      if (facts.nextWeekPlan) return { status: "done", reason: `${facts.nextWeekStart} haftasının planı hazır.` };
      if (facts.analyzedCount === 0) return { status: "blocked", reason: "Plan için incelenmiş içerik yok." };
      return { status: "due", reason: `${facts.nextWeekStart} haftasının planı yok${facts.thisWeekPlan ? " (bu haftanınki var)" : ""}.`, jobKind: "plan" };
    }
    case "measure": {
      if (facts.ownContentCount === 0) return { status: "blocked", reason: "Ölçülecek kendi paylaşım yok." };
      if (!facts.zernioKey) return { status: "blocked", reason: "Bu çalışma alanı için Zernio anahtarı yok; ölçüm okunamaz." };
      if (facts.lastMeasuredAt === undefined) return { status: "due", reason: "Hiç ölçüm alınmamış.", jobKind: "measure_zernio" };
      const age = ageDays(facts.lastMeasuredAt, now);
      return age >= rules.measureFreshDays
        ? { status: "due", reason: `Son ölçüm ${n(age)} gün önce (eşik ${n(rules.measureFreshDays)} gün).`, jobKind: "measure_zernio" }
        : { status: "done", reason: "Bugünün ölçümü alınmış." };
    }
    case "share": {
      const q = facts.publishQueue;
      if (q !== undefined && q.dueForPublish > 0) return { status: "due", reason: `${n(q.dueForPublish)} onaylı video yayına gönderilecek ya da kapatılacak.`, jobKind: "publish" };
      if (q !== undefined && q.returnable > 0) return { status: "due", reason: `${n(q.returnable)} stüdyo videosu dönmüş; yayın onayına hazırlanacak.`, jobKind: "order_return" };
      if (q !== undefined && q.awaitingApproval > 0) return { status: "blocked", reason: `${n(q.awaitingApproval)} video senin yayın onayını bekliyor (onay insanda, zincir onaylamaz).` };
      return { status: "done", reason: "Yayın bekleyen stüdyo videosu yok." };
    }
    case "slip":
    case "learn":
      return { status: "not_built", reason: NOT_BUILT[id] ?? "Kod henüz yok." };
  }
}

/** Otomatik iş anahtarının kapattığı adımlar: topla → incele → etiket → plan (haftalık plan), ölçüm. */
const AUTO_OFF_REASON: Partial<Record<CycleStepId, { flag: "autoWeeklyPlan" | "autoMeasure"; reason: string }>> = {
  collect: { flag: "autoWeeklyPlan", reason: "Otomatik haftalık plan kapalı; toplama kendiliğinden açılmaz." },
  analyze: { flag: "autoWeeklyPlan", reason: "Otomatik haftalık plan kapalı; inceleme kendiliğinden açılmaz." },
  label: { flag: "autoWeeklyPlan", reason: "Otomatik haftalık plan kapalı; etiketleme kendiliğinden açılmaz." },
  plan: { flag: "autoWeeklyPlan", reason: "Otomatik haftalık plan kapalı; plan kendiliğinden hazırlanmaz." },
  measure: { flag: "autoMeasure", reason: "Otomatik günlük ölçüm kapalı; ölçüm kendiliğinden açılmaz." },
};

/** Anahtar kapalıyken yapılacak (`due` / `needs_approval`) adım `blocked` olur ve iş türü düşer; `done` / `blocked` adıma dokunmaz. */
function applyAutomation(id: CycleStepId, verdict: Verdict, facts: CycleFacts): Verdict {
  const rule = AUTO_OFF_REASON[id];
  if (rule === undefined || facts[rule.flag] !== false) return verdict;
  if (verdict.status !== "due" && verdict.status !== "needs_approval") return verdict;
  return { status: "blocked", reason: rule.reason };
}

export function deriveCycle(facts: CycleFacts, now: Date): CycleState {
  const done = new Set<CycleStepId>();
  const steps: CycleStep[] = CYCLE_STEP_IDS.map((id) => {
    const verdict = applyAutomation(id, verdictOf(id, facts, now, done), facts);
    if (verdict.status === "done") done.add(id);
    const lastJob = lastJobOf(id, facts.jobs);
    const running = lastJob !== undefined && (lastJob.status === "queued" || lastJob.status === "running");
    return { id, ...verdict, reason: running ? `${verdict.reason} (iş sürüyor)` : verdict.reason, ...(lastJob === undefined ? {} : { lastJob }) };
  });
  const next = steps.find((step) => step.status === "due" || step.status === "needs_approval");
  // Para harcayan adımın jobKind'ı gerçekten harcayan türdür (tür tablosuyla tutarlılık).
  for (const step of steps) if (step.status === "needs_approval" && step.jobKind !== undefined && JOB_KIND_SPEC[step.jobKind].spend === "never") throw new Error(`${step.id}: needs_approval ama ${step.jobKind} para harcamaz`);
  return { workspaceId: facts.workspaceId, asOf: now.toISOString(), accountType: facts.accountType, ...(next === undefined ? {} : { next: next.id }), steps };
}
