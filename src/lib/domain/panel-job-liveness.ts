/**
 * Panel işinin zaman kuralları (saf): işçi nabzı, ekran yoklaması, "yanıt vermiyor" ve işçi dürtme eşikleri. `panel-job.ts` yeniden dışa verir
 * (importlar değişmez); dosya 400 satır sınırı için ayrıldı.
 */
import type { PanelJob } from "@/lib/domain/panel-job";

/** İşçi nabzı (ms). */
export const JOB_HEARTBEAT_INTERVAL_MS = 10_000;
/** Nabzı bundan eski `running` iş "yanıt vermiyor"dur. DB (`private.panel_job_stale_after`) ile AYNI değer: 90 sn. */
export const JOB_STALE_AFTER_MS = 90_000;
/** Ekranın yoklama aralığı (ms); yalnız etkin iş varken, sekme görünürken. */
export const JOB_POLL_INTERVAL_MS = 4_000;
/** Bu kadar süredir `queued` duran iş için işçi dürtülür (işçi ölmüş olabilir). */
export const JOB_KICK_AFTER_MS = 15_000;
/** Aynı tarayıcı iki dürtme arasında en az bu kadar bekler (sırada bekleyen iş her yoklamada işçi doğurmasın). */
export const JOB_KICK_MIN_INTERVAL_MS = 30_000;

/** `stale: true` = çalışıyor görünen ama nabzı bayat iş; `silentMs` son nabızdan beri geçen süre (nabız okunamıyorsa yok). */
export type JobStaleness = { stale: false } | { stale: true; silentMs?: number };

/**
 * "Yanıt vermiyor" kuralı (saf; ekran ve depo AYNI fonksiyonu kullanır). Yalnız `running` iş bayat olabilir: son nabız
 * `JOB_STALE_AFTER_MS`'ten eskiyse ya da okunamıyorsa bayattır. Bayat iş kendiliğinden KAPANMAZ (uyku / kapak sonrası yanlış kapatma
 * olmasın): yalnız yeni iş isteği, claim ve iptal anında `failed` + `worker_lost` olur.
 */
export function jobStaleness(job: Pick<PanelJob, "status" | "heartbeatAt">, now: Date): JobStaleness {
  if (job.status !== "running") return { stale: false };
  const beat = job.heartbeatAt === undefined ? Number.NaN : Date.parse(job.heartbeatAt);
  if (Number.isNaN(beat)) return { stale: true };
  const silentMs = now.getTime() - beat;
  return silentMs > JOB_STALE_AFTER_MS ? { stale: true, silentMs } : { stale: false };
}

/** Sıradaki iş `JOB_KICK_AFTER_MS`'tir bekliyor mu: işçi dürtülmeli (dürtme idempotenttir: fazla işçi iş alamaz, çıkar). */
export function needsWorkerKick(job: Pick<PanelJob, "status" | "createdAt">, now: Date): boolean {
  if (job.status !== "queued") return false;
  const waited = now.getTime() - Date.parse(job.createdAt);
  return Number.isFinite(waited) && waited >= JOB_KICK_AFTER_MS;
}
