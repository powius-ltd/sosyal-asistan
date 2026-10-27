/**
 * İşçi döngüsü: kuyruktan iş al (`claim_panel_job`) → koştur (`runJob`) → sıradaki. Kuyruk adı PARAMETREDİR (canlı işçi `panel`'i alır;
 * testler kendi kuyruğunu verir). İşi DB verir: iş kimliği, çalışma alanı, tutar hiçbir zaman komut satırından / ortamdan gelmez.
 *
 *   drain  sıradaki işleri al; alınacak iş kalmayınca çık (kuyruk boş ya da kuyrukta başka işçinin canlı işi var: fazla işçi çıkar)
 *   watch  sürekli bekle (`pollMs` aralıkla yokla); `signal` iptal edilince iş aralarında çıkar
 *
 * Başlangıç bakımı (hata işçiyi düşürmez): çökmüş koşulardan kalan geçici video klasörleri süpürülür, eski iş günlükleri boşaltılır,
 * KENDİ kuyruğunun "işi bitmiş ama kredi ayırması açık" kayıtları kapatılır (yazılı borç düşülür, borç yoksa ayırma bırakılır).
 * Çalışma alanına özel bakım (`runHousekeeping`) iş alınınca, o işin çalışma alanı için yapılır (`run-job.ts`; önizlemede yapılmaz).
 * Durma: çit kaybı (iş elden alındı) ve sert süre tavanı işçiyi DURDURUR (`WORKER_EXIT.stopped`): yeni iş alınmaz.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobCreditsPort } from "@/lib/job-runner/job-credits";
import { JOB_LOG_RETENTION_MS, type JobStore } from "@/lib/job-runner/job-store";
import { runJob, type RunJobOptions } from "@/lib/job-runner/run-job";

/** Çıkış kodları: 0 alınacak iş kalmadı · 1 yapılandırma / beklenmeyen hata (betik verir) · 3 işçi durdu (çit kaybı ya da sert süre tavanı). */
export const WORKER_EXIT = { drained: 0, error: 1, stopped: 3 } as const;
export type WorkerExitCode = (typeof WORKER_EXIT)[keyof typeof WORKER_EXIT];

export type WorkerMode = "drain" | "watch";
/** `watch` modunda iki yoklama arası (ms). */
export const WATCH_POLL_MS = 5_000;

export interface WorkerOptions extends Pick<RunJobOptions, "clock" | "clockMs" | "heartbeatMs" | "timeoutMs" | "hardGraceMs"> {
  mode: WorkerMode;
  queue: string;
  store: JobStore;
  deps: JobRunnerDeps;
  /** Kredi defteri bağlaması (canlı işçi her zaman verir); verilmezse kredi çağrısı yapılmaz, krediye bağlı iş koşturulmaz. */
  credits?: JobCreditsPort;
  /** Her iş kapandıktan sonra çağrılır (başlangıç işinin bitiş bildirimi). */
  onJobFinished?: RunJobOptions["onFinished"];
  /** İşçi kimliği (`worker_id`); verilmezse süreç kimliği + rastgele sonek. */
  workerId?: string;
  log?: (line: string) => void;
  /** Çökmüş koşulardan kalan geçici klasörleri süpürür; silinen klasör sayısı. Verilmezse süpürme yok. */
  sweepTemp?: () => number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** `watch` modunu durdurur (iş aralarında bakılır). */
  signal?: AbortSignal;
}

export interface WorkerResult {
  code: WorkerExitCode;
  /** Koşturulan iş sayısı. */
  jobs: number;
  reason: "drained" | "aborted" | "lost" | "abandoned";
}

/** `worker_id` biçimi DB check'iyle aynı: `^[A-Za-z0-9._:-]{1,80}$`. */
export function newWorkerId(pid: number = process.pid): string {
  return `worker-${pid}-${randomUUID().slice(0, 8)}`;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

async function startupMaintenance(options: WorkerOptions, log: (line: string) => void): Promise<void> {
  try {
    const removed = options.sweepTemp?.() ?? 0;
    if (removed > 0) log(`Eski geçici klasör temizlendi: ${removed}.`);
  } catch (error) {
    log(`Uyarı: geçici klasörler süpürülemedi: ${errorMessage(error)}`);
  }
  try {
    const now = (options.clock ?? (() => new Date()))();
    const cleared = await options.store.clearOldLogTails(options.queue, new Date(now.getTime() - JOB_LOG_RETENTION_MS));
    if (cleared > 0) log(`Eski iş günlüğü boşaltıldı: ${cleared}.`);
  } catch (error) {
    log(`Uyarı: ${errorMessage(error)}`);
  }
  try {
    const swept = (await options.credits?.sweep(options.queue)) ?? 0;
    if (swept > 0) log(`Açık kalmış kredi ayırması kapatıldı: ${swept}.`);
  } catch (error) {
    log(`Uyarı: açık kredi ayırmaları süpürülemedi: ${errorMessage(error)}`);
  }
}

export async function runWorker(options: WorkerOptions): Promise<WorkerResult> {
  const log = options.log ?? (() => undefined);
  const workerId = options.workerId ?? newWorkerId();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  log(`İşçi ${workerId} başladı (kuyruk: ${options.queue}, mod: ${options.mode}).`);
  await startupMaintenance(options, log);

  let jobs = 0;
  for (;;) {
    if (options.signal?.aborted) return { code: WORKER_EXIT.drained, jobs, reason: "aborted" };
    const job = await options.store.claim(options.queue, workerId);
    if (job === undefined) {
      if (options.mode === "drain") {
        log(`Alınacak iş yok: işçi çıkıyor (${jobs} iş koşturuldu).`);
        return { code: WORKER_EXIT.drained, jobs, reason: "drained" };
      }
      await sleep(options.pollMs ?? WATCH_POLL_MS);
      continue;
    }
    jobs += 1;
    const result = await runJob(job, {
      store: options.store,
      deps: options.deps,
      credits: options.credits,
      onFinished: options.onJobFinished,
      workerId,
      echo: log,
      clock: options.clock,
      clockMs: options.clockMs,
      heartbeatMs: options.heartbeatMs,
      timeoutMs: options.timeoutMs,
      hardGraceMs: options.hardGraceMs,
    });
    if (result.lost) {
      log("İş bu işçinin elinden alındı (çit): işçi duruyor.");
      return { code: WORKER_EXIT.stopped, jobs, reason: "lost" };
    }
    if (result.abandoned) return { code: WORKER_EXIT.stopped, jobs, reason: "abandoned" };
  }
}
