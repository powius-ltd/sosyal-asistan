/**
 * Panel işinin GÖRÜNÜM modeli: durum şeridi, basılan düğme ve `GET /api/isler` yanıtı aynı şekli kullanır. Saf (sunucu + istemci).
 *
 * İki katman: (1) herkesin gördüğü `JobStatusView` — tür, durum, adım durumu, sayaç, sonuç KODU; tutar, sağlayıcı, günlük, ham not,
 * hata metni YOK (ekran cümleyi koddan kurar: `lib/plain-language.ts`). (2) `operator`: işin tamamı, YALNIZ yönetici modunda eklenir.
 * Müşteri görünümüne para / sağlayıcı / günlük sızmaması bu dönüşümde sağlanır; ayrı ayrı süzülmez.
 */
import { onboardingPhaseOf, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import {
  isActiveJob,
  jobStaleness,
  needsWorkerKick,
  type JobKind,
  type JobOutcomeCode,
  type JobProgress,
  type JobStatus,
  type JobStepId,
  type JobStepStatus,
  type PanelJob,
} from "@/lib/domain/panel-job";

/** Adımın herkese gösterilebilir hâli (ham not, süre, harcama yok). */
export type JobStepView = { id: JobStepId; status: JobStepStatus; code?: JobOutcomeCode };

export type JobStatusView = {
  id: string;
  kind: JobKind;
  dryRun: boolean;
  /** Başlangıç işinin aşaması (`probe` hesaba bakış, `build` ilk inceleme); başka türde alan yok. Bitiş bildirimi buna bakar. */
  phase?: OnboardingPhase;
  status: JobStatus;
  /** Çalışıyor görünüyor ama nabzı bayat: ekranda "yanıt vermiyor". */
  stale: boolean;
  /** Durdurma istendi: iş adım sınırında duracak. */
  cancelRequested: boolean;
  currentStep?: JobStepId;
  progress?: JobProgress;
  steps: JobStepView[];
  /** Bilinen sonuç kodu (`result.outcome`). */
  outcome?: JobOutcomeCode;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** İşin tamamı (onay / tutar, ham adım notu, günlük, hata, tahmin). YALNIZ yönetici modunda dolu; müşteri görünümünde alan yoktur. */
  operator?: PanelJob;
};

/** `GET /api/isler` yanıtı. Çalışma alanı gövdeden / sorgudan değil `getPanelContext()`'ten çözülür; uç yan etkisizdir. */
export type JobsStatusResponse = {
  /** Çalışma alanının etkin işi (sırada / çalışıyor); yoksa alan yok. */
  active?: JobStatusView;
  /** `?id=<iş>` ile istenen iş (bitmiş olabilir: basılan düğme sonucu bununla okur); istenmediyse ya da bulunamadıysa alan yok. */
  job?: JobStatusView;
  /** Sırada bekleyen işi alacak işçi görünmüyor: yönetici tarayıcısı `kickWorkerAction` çağırır. Müşteri görünümünde hep false. */
  workerNeeded: boolean;
};

export interface JobViewOptions {
  /** İstek anı (tek saat): bayatlık buna göre. */
  now: Date;
  /** Yönetici modu: işin tamamı eklenir. */
  operator: boolean;
}

export function toJobStatusView(job: PanelJob, options: JobViewOptions): JobStatusView {
  const phase = onboardingPhaseOf(job);
  return {
    id: job.id,
    kind: job.kind,
    dryRun: job.dryRun,
    ...(phase === undefined ? {} : { phase }),
    status: job.status,
    stale: jobStaleness(job, options.now).stale,
    cancelRequested: job.cancelRequestedAt !== undefined && isActiveJob(job),
    ...(job.currentStep === undefined ? {} : { currentStep: job.currentStep }),
    ...(job.progress === undefined ? {} : { progress: job.progress }),
    steps: job.steps.map((step) => ({ id: step.id, status: step.status, ...(step.code === undefined ? {} : { code: step.code }) })),
    ...(job.result?.outcome === undefined ? {} : { outcome: job.result.outcome }),
    createdAt: job.createdAt,
    ...(job.startedAt === undefined ? {} : { startedAt: job.startedAt }),
    ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
    ...(options.operator ? { operator: job } : {}),
  };
}

/**
 * Durum yanıtını kurar: `jobs` çalışma alanının işleridir (en çok biri etkin), `requested` `?id=` ile istenen iş (yoksa undefined).
 * `workerNeeded` yalnız yönetici modunda hesaplanır (müşteri işçi dürtemez).
 */
export function toJobsStatusResponse(input: { jobs: readonly PanelJob[]; requested?: PanelJob | null } & JobViewOptions): JobsStatusResponse {
  const active = input.jobs.find(isActiveJob);
  return {
    ...(active === undefined ? {} : { active: toJobStatusView(active, input) }),
    ...(input.requested ? { job: toJobStatusView(input.requested, input) } : {}),
    workerNeeded: input.operator && active !== undefined && needsWorkerKick(active, input.now),
  };
}
