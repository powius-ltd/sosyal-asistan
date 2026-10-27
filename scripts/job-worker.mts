/**
 * Panel işçisi (yerel): `npm run worker -- --drain | --watch`.
 *
 * `panel_jobs` kuyruğundan (`JOB_QUEUE_DEFAULT`) sıradaki işi `claim_panel_job` ile alır, türe göre mevcut işlevi koşturur
 * (`src/lib/job-runner/`: haftalık tur, toplama, ölçüm, video inceleme, açı etiketleme, plan, notlar), her adımda satırı çitli yazımla
 * günceller (`where id and worker_id and status = 'running'`; 0 satır → dur) ve 10 sn'de bir nabız atar. Harcama tavanını YALNIZ satırdaki
 * onaydan okur (ortam değişkeni / varsayılan yok); onaysız satırda toplama hiç çağrılmaz. Krediye bağlı işte (satırda kredi tavanı var) iş
 * kapanırken yapılan birim kadar kredi düşer; `CREDITS_ENFORCED=on` iken kredi ayrılmamış işi koşturmaz (`src/lib/job-runner/job-credits.ts`). Argümanlar sabittir: iş kimliği, çalışma alanı,
 * kuyruk ya da tutar komut satırından GELMEZ (bilinmeyen argüman hata verir).
 *   --drain  sıradaki işleri al, alınacak iş kalmayınca çık (panelin başlattığı mod)
 *   --watch  sürekli bekle (yedek: elle / zamanlayıcıyla açılan işçi)
 * Panel bu betiği `node --conditions=react-server --env-file=.env.local --import <tsx loader> scripts/job-worker.mts --drain` biçiminde
 * başlatır (tek süreç); `.env.local` Node'un `--env-file`'ıyla yüklenir. Gizli değerler yazdırılmaz, eksik değişkenin yalnız ADI yazılır.
 * Günlük: stdout / stderr (başlatan dosyaya yönlendirir) + işin `log_tail` sütunu (son satırlar; yalnız yönetici görür).
 * Sözleşme: `src/lib/domain/panel-job.ts`, `src/lib/data/job-schema.ts`, migration 0016. Plan: `docs/PANEL-KONTROL-PLAN.md`.
 * Çıkış kodu: 0 alınacak iş kalmadı · 1 yapılandırma / beklenmeyen hata · 3 işçi durdu (iş elinden alındı ya da süre tavanı; yeni iş almaz).
 */
import { withDirector } from "@/lib/agents/director/hook";
import { JOB_QUEUE_DEFAULT, JOB_WORKER_MODES, type JobWorkerMode } from "@/lib/domain/panel-job";
import { missingEnv } from "@/lib/intel/context";
import { createFinishNotifier } from "@/lib/job-runner/finish-notice";
import { createJobStore } from "@/lib/job-runner/job-store";
import { createRealJobCredits } from "@/lib/job-runner/real-credits";
import { createRealDeps, sweepWorkerTemp } from "@/lib/job-runner/real-deps";
import { runWorker, WORKER_EXIT, type WorkerMode } from "@/lib/job-runner/worker";
import { getAdminClient } from "@/lib/supabase/admin";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;
const MODE_OF: Record<JobWorkerMode, WorkerMode> = { "--drain": "drain", "--watch": "watch" };
const USAGE = `Kullanım: npm run worker -- ${JOB_WORKER_MODES.join(" | ")}`;

function parseMode(argv: readonly string[]): WorkerMode {
  const flag = JOB_WORKER_MODES.find((mode) => mode === argv[0]);
  if (argv.length !== 1 || flag === undefined) throw new Error(`Tam olarak bir mod verilmeli. ${USAGE}`);
  return MODE_OF[flag];
}

const stamped = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

/** Zorla çıkıştan önceki bekleme: bitiş yazımının bağlantısı kapanırken hemen çıkmak Windows'ta libuv iddiasına (çıkış 127) takılabiliyor. */
const FORCE_EXIT_DELAY_MS = 500;

async function main(): Promise<{ code: number; force: boolean }> {
  const mode = parseMode(process.argv.slice(2));
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return { code: WORKER_EXIT.error, force: false };
  }
  const client = getAdminClient();
  const result = await runWorker({
    mode,
    queue: JOB_QUEUE_DEFAULT,
    store: createJobStore(client),
    deps: createRealDeps(),
    credits: createRealJobCredits(client),
    // `AGENT_AUTO=on` iken iş bitince yönetici ajan turu çalışır; kapalıyken halka zinciri yalnız `CYCLE_AUTO=on` iken kurulur
    // (ikisi de kapalıyken kanca bugünkü, yalnız bitiş bildirimi, kalır).
    onJobFinished: withDirector(createFinishNotifier(client, stamped), { client, env: process.env, log: stamped }),
    sweepTemp: sweepWorkerTemp,
    log: stamped,
  });
  // Sert süre tavanında yolda kalan adım süreci açık tutar: işçi yeni iş almadan KESİN çıkmalı. Diğer hâllerde süreç kendiliğinden biter.
  return { code: result.code, force: result.reason === "abandoned" };
}

main().then(
  ({ code, force }) => {
    process.exitCode = code;
    if (force) setTimeout(() => process.exit(code), FORCE_EXIT_DELAY_MS);
  },
  (error: unknown) => {
    console.error(`İşçi başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = WORKER_EXIT.error;
  },
);
