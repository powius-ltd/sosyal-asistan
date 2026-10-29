/**
 * Alınmış (claim edilmiş) TEK işi koşturur: oturum + nabız → bağlam → türe göre SABİT dallanma → kapanış yazımı.
 *
 * Tür → işlev eşlemesi sabit `switch`'tir: satırdaki hiçbir metin komut, betik adı ya da kabuk argümanı olmaz. Çalışma alanı satırdan
 * gelir. Beklenmeyen hata işi `failed` + `error` kapatır (yazı aracı kalıcı olarak yoksa `blocked` + `llm_unavailable`).
 *
 * KREDİ (`job-credits.ts`): işin ayırması açık değilse iş hiç koşturulmaz (`blocked` + `insufficient_credits`); iş nasıl biterse bitsin
 * (tamam, kısmi, hata, iptal, süre tavanı) kapanıştan ÖNCE yapılan birim kadar kredi düşülür, kalan serbest bırakılır ve özet işin sonucuna
 * yazılır. Krediye bağlı olmayan işte (zorlama kapalı, önizleme) hiçbir kredi çağrısı yapılmaz. İş boyunca açılan koşular işe bağlanır
 * (`lib/job-scope.ts` → `collection_runs.panel_job_id`).
 *
 * SÜRE TAVANI (`JOB_KIND_SPEC.timeoutMinutes`; başlangıç işinde aşamanınki: `ONBOARDING_PHASE_SPEC`): yumuşak sınırdan sonra yeni adım / video başlamaz (oturum `timeout` der) ve çalışan
 * adımın bitmesi beklenir; `HARD_TIMEOUT_GRACE_MS` sonra hâlâ bitmediyse iş `failed` + `timeout` yazılır ve `abandoned: true` döner:
 * yolda kalan iş bu süreçte sürüyor olabilir, işçi YENİ İŞ ALMADAN çıkmalıdır.
 */
import "server-only";

import { JOB_KIND_SPEC, type JobKind, type PanelJob } from "@/lib/domain/panel-job";
import { unboundMeter, type CreditMeter } from "@/lib/job-runner/credit-meter";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { closeJobCredits, NO_JOB_CREDITS, openJobCredits, type JobCreditsPort } from "@/lib/job-runner/job-credits";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";
import { createJobSession, type JobFinal, type JobSession } from "@/lib/job-runner/job-session";
import type { JobStore } from "@/lib/job-runner/job-store";
import { onboardingTimeoutMinutes, runOnboardingJob } from "@/lib/job-runner/run-onboarding";
import { runRoutineJob } from "@/lib/job-runner/run-routine";
import { runProduceJob } from "@/lib/job-runner/run-produce";
import { runSingleJob } from "@/lib/job-runner/run-single";
import { isCopyEdition } from "@/lib/edition";
import { routineCollectMaxUsd } from "@/lib/job-runner/spend-gate";
import { runInJobScope } from "@/lib/job-scope";
import { isLlmUnavailableError } from "@/lib/orchestrator/llm-failure";

/** Yumuşak süre tavanından sonra çalışan adımın bitmesi için tanınan pay. */
export const HARD_TIMEOUT_GRACE_MS = 10 * 60 * 1000;

/** Türün ek ortam gereksinimi (betiklerin `REQUIRED_ENV` listeleriyle aynı): Apify'a giden işler anahtar ister. */
const APIFY_ENV = ["APIFY_TOKEN"] as const;

export interface RunJobOptions {
  store: JobStore;
  deps: JobRunnerDeps;
  workerId: string;
  /** Kredi defteri bağlaması; verilmezse zorlama kapalı sayılır ve krediye bağlı iş koşturulmaz (ayırması okunamaz). */
  credits?: JobCreditsPort;
  /** Gerçek saat (nabız, süre tavanı, bağlamın `now`'ı). */
  clock?: () => Date;
  /** Süre ölçümü (ms). */
  clockMs?: () => number;
  echo?: (line: string) => void;
  /** İş kapanış satırı yazıldıktan sonra çağrılır (başlangıç işinin bitiş bildirimi); FIRLATMAMALI. Çit kaybında çağrılmaz. */
  onFinished?: JobFinishedHook;
  heartbeatMs?: number;
  /** Test: süre tavanı (ms) ve sert sınır payı. */
  timeoutMs?: number;
  hardGraceMs?: number;
}

export interface RunJobResult {
  /** Yazılan bitiş durumu; çit kaybında undefined (yazılamadı). */
  status?: JobFinal["status"];
  /** Çit kaybedildi (0 satır): işçi durmalı. */
  lost: boolean;
  /** Sert süre tavanı: yolda kalan iş sürüyor olabilir; işçi yeni iş almadan çıkmalı. */
  abandoned: boolean;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

function requiredEnv(job: PanelJob, now: Date): readonly string[] {
  const kind: JobKind = job.kind;
  switch (kind) {
    case "collect":
    case "measure":
    case "analyze":
    case "discover":
    case "onboarding": // iki aşama da ücretli toplamayla başlar (hesap doğrulama / ilk toplama)
      return APIFY_ENV;
    case "routine":
      return routineCollectMaxUsd(job, now) === undefined ? [] : APIFY_ENV;
    case "label":
    case "plan":
    case "briefing":
    case "order": // dosya yazar, ortam değişkeni istemez
    case "order_return": // dosya okur, DB yazar
    case "publish": // Zernio anahtarı yoksa iş kendi koduyla (`zernio_key_missing`) durur
    case "ads_sync": // Zernio anahtarı yoksa iş kendi koduyla (`zernio_key_missing`) durur
    case "measure_zernio": // anahtar yoksa iş kendi koduyla (`zernio_key_missing`) durur
    case "produce": // hesabın ses anahtarı hesap bilindikten sonra koşucuda sorulur
      return [];
  }
}

async function work(job: PanelJob, session: JobSession, options: RunJobOptions, now: Date, meter: CreditMeter): Promise<JobFinal> {
  const { deps } = options;
  const clockMs = options.clockMs ?? (() => performance.now());
  if (job.dryRun && !JOB_KIND_SPEC[job.kind].preview) throw new Error(`"${job.kind}" türünde önizleme yok: iş koşturulmadı.`);
  // Müşteri kopyasında reklam modülü yok: istek tarafı da reddeder (`parseRequestJobInput`); eski satır gelirse hiç koşmaz.
  if (job.kind === "ads_sync" && isCopyEdition()) throw new Error("Bu sürümde reklam verisi okunmaz: iş koşturulmadı.");
  const missing = deps.missingEnv(requiredEnv(job, now));
  if (missing.length > 0) throw new Error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);

  const ctx = await deps.createContext(now, job.workspaceId);
  if (ctx.workspaceId !== job.workspaceId) throw new Error("Bağlam başka bir çalışma alanına çözüldü: iş koşturulmadı.");
  session.log(`İş ${job.id.slice(0, 8)} · ${job.kind}${job.dryRun ? " (önizleme)" : ""} · çalışma alanı ${ctx.workspace.name} (${ctx.workspaceSlug ?? ctx.workspaceId.slice(0, 8)})`);
  // Önizleme hiçbir şey yazmaz: bakım (silme / kapatma) yalnız gerçek koşuda.
  if (!job.dryRun) await deps.housekeeping({ client: ctx.client, workspaceId: ctx.workspaceId, now: ctx.now }, session.log);

  const kind = job.kind;
  switch (kind) {
    case "routine":
      return runRoutineJob(job, ctx, session, deps, clockMs, meter);
    case "onboarding":
      return runOnboardingJob(job, ctx, session, deps, clockMs, meter);
    case "produce":
      return runProduceJob(job, ctx, session, deps, clockMs);
    case "collect":
    case "measure":
    case "analyze":
    case "label":
    case "plan":
    case "briefing":
    case "measure_zernio":
    case "discover":
    case "order":
    case "order_return":
    case "publish":
    case "ads_sync":
      return runSingleJob(kind, job, ctx, session, deps, clockMs, meter);
  }
}

/** Kanca bir şey fırlatsa bile iş sonucu değişmez (bildirim süstür; satır kapanmıştır). */
async function notifyFinished(hook: JobFinishedHook | undefined, job: PanelJob, final: JobFinal, log: (line: string) => void): Promise<void> {
  if (hook === undefined) return;
  try {
    await hook(job, final);
  } catch (error) {
    log(`Uyarı: bitiş kancası hata verdi: ${errorMessage(error)}`);
  }
}

export async function runJob(job: PanelJob, options: RunJobOptions): Promise<RunJobResult> {
  const clock = options.clock ?? (() => new Date());
  const echo = options.echo ?? (() => undefined);
  const startedAt = clock();
  // Başlangıç işinde süre tavanı aşamaya göredir (hesaba bakış kısa, ilk tur uzun); diğer türlerde tür tablosundan.
  const timeoutMs = options.timeoutMs ?? (onboardingTimeoutMinutes(job) ?? JOB_KIND_SPEC[job.kind].timeoutMinutes) * 60_000;
  const session = createJobSession({ store: options.store, job, workerId: options.workerId, clock, echo, softDeadline: new Date(startedAt.getTime() + timeoutMs) });
  session.startHeartbeat(options.heartbeatMs);

  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const hard = new Promise<"hard_timeout">((resolve) => {
    hardTimer = setTimeout(() => resolve("hard_timeout"), timeoutMs + (options.hardGraceMs ?? HARD_TIMEOUT_GRACE_MS));
  });
  const credits = options.credits ?? NO_JOB_CREDITS;
  /** Açılış geçene kadar sayaç bağsızdır: kapanışta hiçbir kredi çağrısı yapılmaz. */
  let meter: CreditMeter = unboundMeter();
  const start = async (): Promise<JobFinal> => {
    const opening = await openJobCredits(job, credits);
    if (!opening.ok) {
      session.log(opening.note);
      return { status: "blocked", result: { outcome: "insufficient_credits" }, error: opening.note };
    }
    meter = opening.meter;
    if (meter.bound) session.log(`Kredi: bu iş için ${meter.reserved} kredi ayrılmış.`);
    return runInJobScope(job.id, () => work(job, session, options, startedAt, meter));
  };
  const running: Promise<JobFinal> = start().catch((error: unknown): JobFinal => {
    const message = errorMessage(error);
    session.log(`Hata: ${message}`);
    return isLlmUnavailableError(error) ? { status: "blocked", result: { outcome: "llm_unavailable" }, error: message } : { status: "failed", result: { outcome: "error" }, error: message };
  });

  try {
    const outcome = await Promise.race([running, hard]);
    const abandoned = outcome === "hard_timeout";
    const verdict: JobFinal = abandoned ? { status: "failed", result: { outcome: "timeout" }, error: "Süre tavanı aşıldı ve çalışan adım bitmedi: iş kapatıldı." } : outcome;
    if (abandoned) session.log("Süre tavanı aşıldı ve çalışan adım bitmedi: iş kapatılıyor, işçi çıkacak.");
    // Kredi kapanışı bitiş yazımından ÖNCE: iş "bitti" görünürken ayırması açık kalmasın (yazılamazsa borç sonuçta kalır, süpürme kapatır).
    const jobCredits = await closeJobCredits(job, meter, credits, session.log);
    const final: JobFinal = jobCredits === undefined ? verdict : { ...verdict, result: { ...verdict.result, credits: jobCredits } };
    session.log(`İş ${job.id.slice(0, 8)} bitti: ${final.status}${final.result?.outcome === undefined ? "" : ` (${final.result.outcome})`}`);
    const written = await session.finish(final);
    if (written) await notifyFinished(options.onFinished, job, final, session.log);
    return { ...(written ? { status: final.status } : {}), lost: session.stopReason() === "lost", abandoned };
  } finally {
    if (hardTimer !== undefined) clearTimeout(hardTimer);
    session.stopHeartbeat();
  }
}
