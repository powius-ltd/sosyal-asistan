/**
 * Zincirin SAF kararı: halka durumu + son işler + günlük sayaç → ya "şu işi aç" ya da "dur, nedeni şu". Veritabanı, saat, ağ yok.
 * Para kapısı burada kesindir: yalnız `chain.ts`'teki $0 türler `request` döner; para isteyen adım `stop: needs_approval`.
 * Durum SAKLANMAZ: her çağrı yeniden türetilir; "kaldığı yerden sürer" kendiliğindendir (onay gelip iş bitince bir sonraki çağrı sıradakini bulur).
 */
import { chainKindOf, isChainSafeKind } from "@/lib/cycle/chain";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { NOTHING_TO_DO } from "@/lib/cycle/no-progress";
import type { CycleLastJob, CycleState, CycleStepId } from "@/lib/cycle/types";
import type { JobKind } from "@/lib/domain/panel-job";

export interface ChainRequest {
  kind: JobKind;
  /** `order`: fişin hafta başı (Pazartesi). */
  week?: string;
}

/**
 * needs_approval: sıradaki adım para harcar (bildirim) · job_failed: son iş başarısız / durdu (bildirim) · cancelled: son iş iptal (sessiz) ·
 * active_job: iş sürüyor ya da sırada (sessiz bekleme) · daily_cap: günlük tavan doldu (sessiz) · not_requestable: sıradaki adımı zincir açamaz
 * (örn. hesap yok; sessiz) · complete: bu tur için yapılacak iş yok.
 */
export type ChainStopReason = "needs_approval" | "job_failed" | "step_failed" | "cancelled" | "active_job" | "daily_cap" | "not_requestable" | "complete";

export interface ChainStop {
  reason: ChainStopReason;
  step?: CycleStepId;
  /** Çalışma alanına bildirim yazılır mı. */
  notify: boolean;
  /** `job_failed`: durduran iş. */
  job?: CycleLastJob;
}

export type ChainDecision = { request: ChainRequest } | { stop: ChainStop };

export interface ChainInput {
  /** Son işler, yeniden eskiye (`CycleFacts.jobs`; kuru koşular hariç). */
  jobs: readonly CycleLastJob[];
  /** Bu çalışma alanında bugün zincirin açtığı iş sayısı. */
  chainJobsToday: number;
  /** Gelecek haftanın planında çekim fişi bekleyen `brief_slot`lu öğe varsa haftanın Pazartesi'si (okuyucu doldurur). */
  slipWeek?: string;
  /** Son işi "yapacak iş yok" bitmiş (`noProgressKinds`) türler: sırası gelse de atlanır, sıradaki adıma geçilir. */
  skipKinds?: ReadonlySet<JobKind>;
}

const stop = (reason: ChainStopReason, extra: Omit<ChainStop, "reason" | "notify"> & { notify?: boolean } = {}): ChainDecision => ({ stop: { notify: false, ...extra, reason } });

export function nextCycleStep(state: CycleState, input: ChainInput): ChainDecision {
  const latest = input.jobs[0];
  if (latest !== undefined && (latest.status === "queued" || latest.status === "running")) return stop("active_job");
  // Başarısız ya da durmuş iş: sessiz yeniden deneme YOK. Yeni başarılı iş (elle ya da onayla) en son iş olunca zincir kendiliğinden açılır.
  if (latest !== undefined && (latest.status === "failed" || latest.status === "blocked")) return stop("job_failed", { job: latest, notify: true });
  // Kısmi biten iş (adımı yarım kaldı) sessizce geçilmez; "yapacak iş yok" diyen kısmi iş hariç (boşa dönen adım atlama kuralı onu yönetir).
  if (latest !== undefined && latest.status === "partial" && latest.outcome !== NOTHING_TO_DO) return stop("step_failed", { job: latest, notify: true });
  if (latest !== undefined && latest.status === "cancelled") return stop("cancelled");
  if (input.chainJobsToday >= CYCLE_RULES.chainDailyMax) return stop("daily_cap");

  for (const step of state.steps.filter((s) => s.status === "due" || s.status === "needs_approval")) {
    if (step.status === "needs_approval") return stop("needs_approval", { step: step.id, notify: true });
    const kind = chainKindOf(step);
    if (kind === undefined || !isChainSafeKind(kind)) return stop("not_requestable", { step: step.id });
    if (input.skipKinds?.has(kind)) continue; // boşa dönen adım: yeniden açılmaz, sıradakine geçilir
    return { request: { kind } };
  }
  return input.slipWeek === undefined ? stop("complete") : { request: { kind: "order", week: input.slipWeek } };
}
