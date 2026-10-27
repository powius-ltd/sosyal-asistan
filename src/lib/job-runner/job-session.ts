/**
 * Tek işin oturumu: adımların / sayacın / günlüğün bellekteki durumu + satıra ÇİTLİ yazımı + nabız + durma kararı.
 *
 * - Yazımlar sıraya girer (nabız ile adım yazımı birbirini ezmez; bitiş yazımından sonra hiçbir yazım gitmez).
 * - Her yazım nabzı da tazeler ve iptal isteğini geri okur. 0 satır → `lost` (çit): bundan sonra HİÇBİR yazım yapılmaz, işçi durur.
 * - Geçici DB hatası işi düşürmez (uyarı yazılır, sonraki yazım dener); yalnız bitiş yazımı birkaç kez yeniden denenir.
 * - Durma nedeni: `lost` (çit) > `cancelled` (iptal isteği) > `timeout` (süre tavanı). Çalışan adım kesilmez; koşturucular adım ve video
 *   sınırında `shouldStop()` sorar. Bir adım / video bu yüzden başlatılmadıysa `markCut()` çağrılır (iş yarıda kesildi).
 */
import "server-only";

import { clipTail, JOB_STEP_NOTE_MAX_CHARS, type JobRowPatch } from "@/lib/data/job-schema";
import { JOB_ERROR_MAX_CHARS, JOB_HEARTBEAT_INTERVAL_MS, type JobProgress, type JobResult, type JobStatus, type JobStep, type JobStepId, type PanelJob } from "@/lib/domain/panel-job";
import { InvalidJobPatchError, type JobStore } from "@/lib/job-runner/job-store";
import { truncateText } from "@/lib/text";

export type StopReason = "lost" | "cancelled" | "timeout";

/** İşin kapanışı: bitiş durumu + sonuç + (varsa) teknik hata metni. */
export interface JobFinal {
  status: Exclude<JobStatus, "queued" | "running">;
  result?: JobResult;
  error?: string;
}

export interface JobSessionOptions {
  store: JobStore;
  job: PanelJob;
  workerId: string;
  /** Süre tavanı (yumuşak): bu andan sonra yeni adım / video başlamaz. */
  softDeadline: Date;
  /** Gerçek saat (nabız, süre tavanı); testte sabitlenir. */
  clock?: () => Date;
  /** Günlük satırının yankısı (işçinin stdout'u). */
  echo?: (line: string) => void;
  /** Bitiş yazımı yeniden denemeleri arasındaki bekleme (ms). */
  retryDelayMs?: number;
}

export interface JobSession {
  readonly job: PanelJob;
  /** Günlük satırı: kuyruğa (son `JOB_LOG_TAIL_MAX_CHARS` karakter) eklenir, sonraki yazımda satıra gider. */
  log(line: string): void;
  stopReason(): StopReason | undefined;
  shouldStop(): boolean;
  /** Bir adım / video durma yüzünden başlatılmadı. */
  markCut(): void;
  wasCut(): boolean;
  /** Nabız (+ günlük kuyruğu); iptal isteğini tazeler. */
  beat(): Promise<void>;
  steps(): readonly JobStep[];
  /** Adım listesini baştan yazar (iş alınınca; `current` çalışan adım). */
  setSteps(steps: readonly JobStep[], current?: JobStepId): Promise<void>;
  startStep(id: JobStepId): Promise<void>;
  /**
   * Adım sınırı: durma istenmişse adımı BAŞLATMAZ (false; iş "kesildi" diye işaretlenir). Değilse "sürüyor" yazar; bu yazım durmayı
   * (iptal isteği, çit kaybı) ortaya çıkarırsa adım yine başlamaz ve satırda "sırada"ya döner. true = çağıran adımı koşturabilir.
   */
  tryStartStep(id: JobStepId): Promise<boolean>;
  /** Adımı kapatır (listede yoksa sona ekler); sayaç sıfırlanır. */
  finishStep(id: JobStepId, outcome: Omit<JobStep, "id">): Promise<void>;
  setProgress(progress: JobProgress | undefined): Promise<void>;
  /** İşi kapatır (hâlâ "sürüyor" görünen adım `failed` yazılır). Çit kaybedildiyse yazmaz (false). */
  finish(final: JobFinal): Promise<boolean>;
  startHeartbeat(intervalMs?: number): void;
  stopHeartbeat(): void;
}

const FINISH_ATTEMPTS = 3;
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

/** jsonb'ye yazılacak adım: not sınırı aşmaz, `undefined` alan taşımaz (katı şema; bilinmeyen tutar yazılmaz). */
export function cleanStep(step: JobStep): JobStep {
  const spend = step.spend === undefined ? undefined : { ...(step.spend.estimateUsd === undefined ? {} : { estimateUsd: step.spend.estimateUsd }), ...(step.spend.actualUsd === undefined ? {} : { actualUsd: step.spend.actualUsd }) };
  return {
    id: step.id,
    status: step.status,
    ...(step.code === undefined ? {} : { code: step.code }),
    ...(step.note === undefined || step.note.trim() === "" ? {} : { note: truncateText(step.note, JOB_STEP_NOTE_MAX_CHARS) }),
    ...(step.seconds === undefined ? {} : { seconds: Math.max(0, step.seconds) }),
    ...(spend === undefined || Object.keys(spend).length === 0 ? {} : { spend }),
  };
}

export function createJobSession(options: JobSessionOptions): JobSession {
  const { store, job, workerId } = options;
  const clock = options.clock ?? (() => new Date());
  const echo = options.echo ?? (() => undefined);
  const ref = { id: job.id, workerId };

  let steps: JobStep[] = [];
  let current: JobStepId | undefined;
  let progress: JobProgress | undefined;
  let logTail = "";
  let lost = false;
  let finished = false;
  let cancelRequested = job.cancelRequestedAt !== undefined;
  let cut = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let chain: Promise<unknown> = Promise.resolve();

  const stamp = (): JobRowPatch => ({ heartbeat_at: clock().toISOString(), log_tail: logTail === "" ? null : logTail });
  const stepState = (): JobRowPatch => ({ steps, current_step: current ?? null, progress: progress ?? null });

  /**
   * Sıradaki yazım. `build` yazım ANINDA çağrılır (bellekteki son durum yazılır). true = satır yazıldı. `closing`: yazım tutarsa oturum
   * kapanır (sıradaki nabız / adım yazımı artık gitmez; çitin 0 satırı "iş alındı" sanılmasın).
   */
  const write = (build: () => JobRowPatch, mode: { onError?: "warn" | "throw"; closing?: boolean } = {}): Promise<boolean> => {
    const next = chain.then(async () => {
      if (lost || finished) return false;
      try {
        const result = await store.patch(ref, { ...stamp(), ...build() });
        if (!result.applied) {
          lost = true;
          echo("Çit: iş satırı artık bu işçinin değil (0 satır etkilendi); işçi duruyor.");
          return false;
        }
        if (mode.closing) finished = true;
        if (result.cancelRequestedAt !== undefined && !cancelRequested) {
          cancelRequested = true;
          echo("Durdurma istendi: çalışan adım bitince durulacak.");
        }
        return true;
      } catch (error) {
        if (mode.onError === "throw") throw error;
        echo(`Uyarı: iş satırı yazılamadı: ${errorMessage(error)}`);
        return false;
      }
    });
    chain = next.catch(() => undefined);
    return next;
  };

  const timedOut = () => clock().getTime() >= options.softDeadline.getTime();
  const stopHeartbeat = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const session: JobSession = {
    job,
    log(line) {
      echo(line);
      logTail = clipTail(logTail === "" ? line : `${logTail}\n${line}`);
    },
    stopReason: () => (lost ? "lost" : cancelRequested ? "cancelled" : timedOut() ? "timeout" : undefined),
    shouldStop: () => session.stopReason() !== undefined,
    markCut() {
      cut = true;
    },
    wasCut: () => cut,
    async beat() {
      await write(() => ({}));
    },
    steps: () => steps,
    async setSteps(next, currentStep) {
      steps = next.map(cleanStep);
      current = currentStep;
      progress = undefined;
      await write(stepState);
    },
    async startStep(id) {
      steps = steps.some((s) => s.id === id) ? steps.map((s) => (s.id === id ? { id, status: "running" } : s)) : [...steps, { id, status: "running" }];
      current = id;
      progress = undefined;
      await write(stepState);
    },
    async tryStartStep(id) {
      if (!session.shouldStop()) {
        await session.startStep(id);
        if (!session.shouldStop()) return true;
        await session.finishStep(id, { status: "pending" });
      }
      cut = true;
      return false;
    },
    async finishStep(id, outcome) {
      const done = cleanStep({ id, ...outcome });
      steps = steps.some((s) => s.id === id) ? steps.map((s) => (s.id === id ? done : s)) : [...steps, done];
      if (current === id) current = undefined;
      progress = undefined;
      await write(stepState);
    },
    async setProgress(next) {
      progress = next === undefined ? undefined : { done: Math.min(next.done, next.total), total: next.total };
      await write(() => ({ progress: progress ?? null }));
    },
    async finish(final) {
      stopHeartbeat();
      // Kapanışta "sürüyor" görünen adım kalmaz (sert süre tavanı: adım bitmeden iş kapatıldı).
      steps = steps.map((step) => (step.status === "running" ? cleanStep({ ...step, status: "failed", code: final.result?.outcome }) : step));
      current = undefined;
      progress = undefined;
      const closing = (): JobRowPatch => ({
        ...stepState(),
        status: final.status,
        // JSON turu `undefined` alanları düşürür (katı şema; bilinmeyen tutar yazılmaz).
        result: final.result === undefined ? null : (JSON.parse(JSON.stringify(final.result)) as JobResult),
        error: final.error === undefined ? null : truncateText(final.error, JOB_ERROR_MAX_CHARS),
        finished_at: clock().toISOString(),
      });
      // Yama doğrulamadan geçmezse (beklenmeyen şekil) iş açık kalmasın: en yalın kapanış yazılır.
      const fallback = (reason: string): JobRowPatch => ({
        status: "failed",
        result: { outcome: "error" },
        error: truncateText(`İş sonucu yazılamadı: ${reason}`, JOB_ERROR_MAX_CHARS),
        current_step: null,
        progress: null,
        finished_at: clock().toISOString(),
      });
      let build = closing;
      for (let attempt = 1; attempt <= FINISH_ATTEMPTS; attempt++) {
        try {
          return await write(build, { onError: "throw", closing: true });
        } catch (error) {
          echo(`Uyarı: iş kapanışı yazılamadı (deneme ${attempt}/${FINISH_ATTEMPTS}): ${errorMessage(error)}`);
          if (error instanceof InvalidJobPatchError) build = () => fallback(errorMessage(error));
          else if (attempt < FINISH_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 1000));
        }
      }
      return false;
    },
    startHeartbeat(intervalMs = JOB_HEARTBEAT_INTERVAL_MS) {
      stopHeartbeat();
      timer = setInterval(() => void session.beat(), intervalMs);
    },
    stopHeartbeat,
  };
  return session;
}
