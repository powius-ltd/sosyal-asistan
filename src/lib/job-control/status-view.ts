/**
 * `GET /api/isler` işleyicisi (route dosyası yalnız bunu çağırır; bağımlılıklar enjekte edilir, test edilebilir). YAN ETKİSİZDİR: iş
 * başlatmaz, işçi dürtmez, yetim iş kapatmaz; yalnız iki okuma yapar (etkin iş + istenirse `?id=` işi).
 *  - Çalışma alanı sorgudan / gövdeden DEĞİL panel bağlamından (`getPanelContext`) gelir; `?id=` başka çalışma alanının işini getiremez
 *    (`repo.getJob` çalışma alanı süzgeçlidir). Biçimsiz kimlik yok sayılır.
 *  - Yanıt `toJobsStatusResponse` ile kurulur: tutar, sağlayıcı, günlük, ham not, hata metni YALNIZ yönetici modunda (`operator` alanı);
 *    müşteri görünümünde bu alan hiç yoktur (alan alan süzülmez).
 *  - `workerNeeded` ("sırada iş var, canlı işçi yok"): domain kuralı (`needsWorkerKick`) + bu ortamda dürtmenin işe yarayacağı
 *    (`canKick`: işler açık ve bu panelin başlattığı işçi yaşamıyor). Müşteri görünümünde hep false.
 * Okuma hatası 500 + kısa Türkçe mesaj döner; ayrıntı istemciye sızmaz (sunucu günlüğüne yazılır).
 */
import "server-only";

import { jobIdSchema } from "@/lib/data/job-input";
import type { PanelRepository } from "@/lib/data/repository";
import { toJobsStatusResponse, type JobsStatusResponse } from "@/lib/domain/panel-job-view";
import { JOBS_STATUS_ID_PARAM } from "@/lib/routes";

export interface JobsStatusContext {
  repo: Pick<PanelRepository, "listJobs" | "getJob">;
  wsId: string;
  /** İstek anı (tek saat): bayatlık ve dürtme eşiği buna göre. */
  now: Date;
}

export interface JobsStatusDeps {
  /** Panel bağlamı (`getPanelContext`). */
  getContext: () => Promise<JobsStatusContext>;
  /** Yönetici modu (`isOperatorMode`). */
  operator: () => boolean;
  /** Dürtme bu ortamda işe yarar mı (işler açık ve canlı işçi görünmüyor). */
  canKick: () => boolean;
  /** Hata günlüğü. */
  log?: (message: string, error: unknown) => void;
}

const HEADERS = { "cache-control": "no-store" } as const;

/** `?id=` değeri: geçerli biçimdeyse iş kimliği, yoksa / biçimsizse undefined (hata değil: alan yanıtta olmaz). */
export function requestedJobId(url: string): string | undefined {
  const raw = new URL(url).searchParams.get(JOBS_STATUS_ID_PARAM);
  if (raw === null) return undefined;
  const parsed = jobIdSchema.safeParse({ jobId: raw });
  return parsed.success ? parsed.data.jobId : undefined;
}

/** Durum yanıtını okur ve kurar (saf okuma). */
export async function readJobsStatus(
  ctx: JobsStatusContext,
  options: { operator: boolean; canKick: boolean; jobId?: string },
): Promise<JobsStatusResponse> {
  const [jobs, requested] = await Promise.all([
    ctx.repo.listJobs(ctx.wsId, { active: true, limit: 1 }),
    options.jobId === undefined ? undefined : ctx.repo.getJob(ctx.wsId, options.jobId),
  ]);
  const response = toJobsStatusResponse({ jobs, requested, now: ctx.now, operator: options.operator });
  return { ...response, workerNeeded: response.workerNeeded && options.canKick };
}

export async function handleJobsStatusRequest(request: Request, deps: JobsStatusDeps): Promise<Response> {
  try {
    const ctx = await deps.getContext();
    const operator = deps.operator();
    const body = await readJobsStatus(ctx, { operator, canKick: operator && deps.canKick(), jobId: requestedJobId(request.url) });
    return Response.json(body, { headers: HEADERS });
  } catch (error) {
    deps.log?.("durum okunamadı", error);
    return Response.json({ message: "İş durumu şu an okunamıyor." }, { status: 500, headers: HEADERS });
  }
}
