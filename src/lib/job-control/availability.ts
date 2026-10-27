/**
 * İşler bu ortamda panelden başlatılabilir mi? Kural (`agents/chat/availability.ts` deseni: hafif, eşzamanlı, yalnız ortam + dosya varlığı;
 * DB'ye ya da ağa gitmez, sayfa başına çağrılabilir):
 *  - barındırılan ortam (`VERCEL`): ayrık süreç başlatılamaz → kapalı;
 *  - veri kaynağı `supabase` değilse (örnek veri ya da geçersiz `DATA_SOURCE`): kuyruk tablosu yok → kapalı;
 *  - işçi betiği (`JOB_WORKER_SCRIPT`) proje kökünde yoksa → kapalı.
 * Operatör modu AYRI denetlenir (`isOperatorMode()`); iş başlatan her action ikisini de ister: tek kapı `job-control/gate.ts` `jobsGate()`.
 * Kapalıyken düğme çizilmez; yönetici görünümünde eski komut metni yedek kalır. Durum şeridi bundan bağımsızdır (herkes görür).
 *
 * Sınır: bu klasör (`lib/job-control`) panel sürecinde çalışır ve `lib/job-runner`'ı (işçi) ASLA içe aktarmaz.
 */
import "server-only";

import { statSync } from "node:fs";
import path from "node:path";

import { JOB_WORKER_SCRIPT } from "@/lib/domain/panel-job";

/**
 * hosted: barındırılan ortam · data_source: örnek (mock) veri · worker_missing: işçi betiği yok · not_ready: özellik henüz bağlanmadı
 * (artık DÖNMEZ; saplama dönemi değeri, tipte yalnız geriye uyum için durur).
 */
export type JobsUnavailableReason = "hosted" | "data_source" | "worker_missing" | "not_ready";

export type JobsAvailability = { available: true } | { available: false; reason: JobsUnavailableReason };

export interface JobsAvailabilityDeps {
  env?: Readonly<Record<string, string | undefined>>;
  /** İşçi betiği dosyası var mı (test). */
  workerScriptExists?: () => boolean;
}

/** Proje kökü: `next start` / `next dev` süreçlerinde çalışma dizinidir (worktree dahil). İşçi betiği ve günlük klasörü buna göre çözülür. */
export function projectRoot(): string {
  return process.cwd();
}

function workerScriptOnDisk(): boolean {
  try {
    // `turbopackIgnore`: betik derlemenin parçası değildir (çalışma anında diskte aranır); yoksa derleyici tüm projeyi izlemeye alır.
    return statSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ projectRoot(), JOB_WORKER_SCRIPT)).isFile();
  } catch {
    return false;
  }
}

export function jobsAvailability(deps: JobsAvailabilityDeps = {}): JobsAvailability {
  const env = deps.env ?? process.env;
  if (env.VERCEL?.trim()) return { available: false, reason: "hosted" };
  // `getDataSource()` ile aynı okuma (boşluk / büyük harf hoş görülür); geçersiz değer burada hata değil, "kapalı"dır.
  if ((env.DATA_SOURCE ?? "").trim().toLowerCase() !== "supabase") return { available: false, reason: "data_source" };
  const exists = deps.workerScriptExists ?? workerScriptOnDisk;
  return exists() ? { available: true } : { available: false, reason: "worker_missing" };
}
