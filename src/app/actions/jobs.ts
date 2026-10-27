"use server";

/**
 * Panel işi action'ları (plan `docs/PANEL-KONTROL-PLAN.md` §2). Action doğrudan POST edilebilir, bu yüzden HER çağrıda:
 *  - kapı: `jobsGate()` (bu ortamda iş başlatılabilir + yönetici modu); kapalıysa `invalid_state`, depoya / işçiye dokunulmaz;
 *  - girdi zod ile (`lib/data/job-input.ts`: depo ile AYNI şema; tür beyaz listeden, bilinmeyen alan ret, tutar ≤ `JOB_SPEND_MAX_USD`);
 *  - çalışma alanı gövdeden OKUNMAZ: `getPanelContext()` çözer ("tüm hesaplar" listesi sunucuda kayıttan gelir);
 *  - istekten gelen HİÇBİR değer komut satırına / ortama girmez: işçi sabit argümanla başlar (`launchWorker`), işi DB'den alır;
 *  - depo hatası ortak yardımcıyla Türkçe mesaja çevrilir (`toActionError`); iş açılınca / durunca tüm düzen yenilenir (durum şeridi).
 * İş burada KOŞTURULMAZ: `repo.requestJob` satırı yazar, ayrık işçi (`scripts/job-worker.mts`) koşturur. İşçinin dosyaları eksikse iş
 * hiç yazılmaz (`invalid_state`); satır yazıldıktan sonra işçi başlatılamazsa iş sırada kalır (satır geri alınmaz), durum ucu "işçi
 * gerekli" der ve `kickWorkerAction` yeniden dener.
 */
import { revalidatePath } from "next/cache";

import { actionFail, actionOk, toActionError, validationFail, type ActionFailure, type ActionResult } from "@/lib/actions/result";
import { getPanelContext } from "@/lib/data";
import { jobIdSchema, requestJobSchema, requestRoutineForAllSchema } from "@/lib/data/job-input";
import type { JobStatus } from "@/lib/domain/panel-job";
import { jobsGate } from "@/lib/job-control/gate";
import { launchedWorkerAlive, launchWorker, workerLaunchProblem } from "@/lib/job-control/launch";
import {
  CANCEL_JOB_MESSAGES,
  JOBS_GATE_MESSAGE,
  REQUEST_JOB_INVALID,
  REQUEST_JOB_MESSAGES,
  routineForAllSummary,
  WORKER_NOT_READY,
  WORKER_START_FAILED,
} from "@/lib/job-control/messages";
import { JobApprovalRefused, requestJobChecked, requestRoutineForAll } from "@/lib/job-control/request";
import { ROUTES } from "@/lib/routes";
import { listWorkspaces } from "@/lib/workspace/registry";

/** Kapı kapalıysa ret; açıksa undefined. */
function gateFailure(): ActionFailure | undefined {
  const gate = jobsGate();
  return gate.open ? undefined : actionFail(JOBS_GATE_MESSAGE[gate.reason], "invalid_state");
}

/** İşçi bu kurulumda başlatılamayacaksa (eksik dosya) iş hiç yazılmaz: sırada sahipsiz iş kalmasın. Sorun yoksa undefined. */
function workerNotReady(): ActionFailure | undefined {
  const problem = workerLaunchProblem();
  if (problem === undefined) return undefined;
  console.error(`[isler] işçi başlatılamaz: ${problem}`);
  return actionFail(WORKER_NOT_READY, "invalid_state");
}

/** Durum şeridi panel düzenindedir: iş açılınca / durunca tüm düzen yenilenir. */
function refreshPanel(): void {
  revalidatePath(ROUTES.overview, "layout");
}

/** İşçiyi başlatır; başlatılamazsa nedeni sunucu günlüğüne yazar ve false döner (iş satırı sırada kalır). */
function startWorker(now: Date): boolean {
  try {
    launchWorker({ now });
    return true;
  } catch (error) {
    console.error("[isler] işçi başlatılamadı", error);
    return false;
  }
}

/** İstek hatası → sonuç: onay reddinin nedeni olduğu gibi söylenir, gerisi ortak çeviriden geçer. */
function requestFailure(error: unknown): ActionFailure {
  if (error instanceof JobApprovalRefused) return actionFail(error.message, "invalid_input");
  return toActionError(error, REQUEST_JOB_MESSAGES);
}

export type RequestJobResult = ActionResult<{ jobId: string }>;

/** İşi sıraya yazar ve işçiyi dürter. Girdi `RequestJobInput` (`requestJobSchema`). Etkin iş varsa `already_exists`. */
export async function requestJobAction(input: unknown): Promise<RequestJobResult> {
  const denied = gateFailure();
  if (denied) return denied;
  const parsed = requestJobSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, REQUEST_JOB_INVALID);
  const notReady = workerNotReady();
  if (notReady) return notReady;

  try {
    const { repo, wsId, now } = await getPanelContext();
    const job = await requestJobChecked(repo, wsId, parsed.data);
    startWorker(now);
    refreshPanel();
    return actionOk({ jobId: job.id });
  } catch (error) {
    return requestFailure(error);
  }
}

export type RequestRoutineForAllResult = ActionResult<{
  /** Açılan iş sayısı. */
  requested: number;
  /** Etkin işi olduğu için atlanan çalışma alanı sayısı. */
  skipped: number;
  /** Başka bir nedenle (onay reddi, depo hatası) iş açılamayan çalışma alanı sayısı. 0'dan büyükse sonuç KISMİ başarıdır. */
  failed: number;
  /** İlk açılamayanın kullanıcıya gösterilebilir nedeni (`failed > 0` ise dolu). */
  failureReason?: string;
  /** Geçerli çalışma alanında açılan iş (orada açılamadıysa yok). */
  jobId?: string;
}>;

/**
 * "Tüm hesaplar için başlat": her çalışma alanına bir haftalık tur (`rutin --all` karşılığı). Girdi `requestRoutineForAllSchema`.
 * En az bir hesapta iş açıldıysa sonuç BAŞARILIDIR ve sayıları taşır: açılan, atlanan (etkin işi var) ve açılamayan (`failed`; ilkinin
 * nedeni `failureReason`). Kısmi başarı gizlenmez: ekran özeti sayılardan kurar (`routineForAllSummary`). HİÇBİR hesapta açılamadıysa ve
 * en az biri açılamama yüzündense sonuç başarısızdır (aynı özet cümlesiyle). Açılan işler geri alınmaz ve işçi yine başlatılır.
 */
export async function requestRoutineForAllAction(input: unknown): Promise<RequestRoutineForAllResult> {
  const denied = gateFailure();
  if (denied) return denied;
  const parsed = requestRoutineForAllSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, REQUEST_JOB_INVALID);
  const notReady = workerNotReady();
  if (notReady) return notReady;

  try {
    const { repo, wsId, now } = await getPanelContext();
    const workspaces = await listWorkspaces();
    const outcome = await requestRoutineForAll({ repo, workspaceIds: workspaces.map((workspace) => workspace.id), currentWsId: wsId, request: parsed.data });
    if (outcome.requested > 0) {
      startWorker(now);
      refreshPanel();
    }
    const first = outcome.failed > 0 ? requestFailure(outcome.firstError) : undefined;
    if (first !== undefined && outcome.requested === 0) return actionFail(routineForAllSummary(outcome, first.message), first.code);
    return actionOk({
      requested: outcome.requested,
      skipped: outcome.skipped,
      failed: outcome.failed,
      ...(first === undefined ? {} : { failureReason: first.message }),
      ...(outcome.jobId === undefined ? {} : { jobId: outcome.jobId }),
    });
  } catch (error) {
    return requestFailure(error);
  }
}

export type CancelJobResult = ActionResult<{ jobId: string; status: JobStatus }>;

/** "Durdur". Girdi `{ jobId }` (`jobIdSchema`). Bitmiş iş `invalid_state`. Dönen `status` işin güncel durumudur (çalışan işte `running`). */
export async function cancelJobAction(input: unknown): Promise<CancelJobResult> {
  const denied = gateFailure();
  if (denied) return denied;
  const parsed = jobIdSchema.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error, "İş kimliği geçersiz.");

  try {
    const { repo, wsId } = await getPanelContext();
    const job = await repo.cancelJob(wsId, parsed.data.jobId);
    refreshPanel();
    return actionOk({ jobId: job.id, status: job.status });
  } catch (error) {
    return toActionError(error, CANCEL_JOB_MESSAGES);
  }
}

export type KickWorkerResult = ActionResult<{ started: boolean }>;

/**
 * Sırada iş bekliyor ama işçi görünmüyorsa işçiyi başlatır. İdempotent: fazla işçi iş alamaz ve çıkar. Girdi yok. `started: false` =
 * başlatmaya gerek yoktu (geçerli çalışma alanında sırada iş yok ya da bu panelin başlattığı işçi hâlâ yaşıyor). Veri değişmez: sayfa
 * yenilenmez.
 */
export async function kickWorkerAction(): Promise<KickWorkerResult> {
  const denied = gateFailure();
  if (denied) return denied;

  try {
    const { repo, wsId, now } = await getPanelContext();
    const queued = await repo.listJobs(wsId, { status: "queued", limit: 1 });
    if (queued.length === 0 || launchedWorkerAlive()) return actionOk({ started: false });
    return startWorker(now) ? actionOk({ started: true }) : actionFail(WORKER_START_FAILED, "unknown");
  } catch (error) {
    return toActionError(error);
  }
}
