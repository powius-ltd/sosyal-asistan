/**
 * `ads_sync` özeti → iş sonucu (SAF eşleme). Ana eşleme dosyasına eklenmez (dosya boyu). Tasarım gereği boş kalmak başarıdır; anahtar yoksa iş `blocked`.
 *
 * KOD EŞLEMESİ: iş sonuç kodları sıralı dosyadadır (`domain/panel-job-outcome.ts`, `job-schema.ts` katı) ve burada eklenemez. Bu yüzden
 * paketin adlandırdığı kodlar var olan koda iner; ayırt eden ayrıntı adım notunda (yönetici görür):
 *   ads_synced → (kod yok, başarı) · ads_no_account → `no_targets` · ads_key_missing → `zernio_key_missing` · ads_auth → `zernio_key_missing`
 *   ads_plan_required → `error` (blocked) · sağlayıcı geçici hata → `step_failed` (failed).
 * Sayılar (hesap / reklam / gün) `result`a girmez (`result.ads` şemada yok); adım notundadır.
 */
import "server-only";

import type { AdsSyncCounts, AdsSyncFailure, AdsSyncResult } from "@/lib/ads/sync-job";
import type { JobVerdict } from "@/lib/job-runner/outcome-map";

export const countsNote = (c: AdsSyncCounts): string =>
  [
    `${c.accounts} hesap · ${c.ads} reklam · ${c.days} gün (${c.rows} günlük ölçü)`,
    c.unlinked > 0 ? `${c.unlinked} hesap Zernio'ya bağlı değil, atlandı` : undefined,
    c.skipped > 0 ? `${c.skipped} ölçü satırı yapıdaki hiçbir reklamla eşleşmedi, yazılmadı` : undefined,
    c.dropped > 0 ? `${c.dropped} öğe okunamadı ya da kimliği yoktu, yazılmadı` : undefined,
    c.emptyWrites > 0 ? `${c.emptyWrites} hesapta ölçü geldi ama hiç satır yazılamadı` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");

const failuresNote = (failures: readonly AdsSyncFailure[]): string => (failures.length === 0 ? "" : ` · okunamayan hesap: ${failures.map((f) => `${f.account} (${f.error})`).join(", ")}`);

export function adsSyncVerdict(run: AdsSyncResult): JobVerdict {
  switch (run.outcome) {
    case "key_missing": {
      const note = "Bu çalışma alanı için Zernio anahtarı yok: hiçbir çağrı yapılmadı.";
      return { step: { status: "needs_approval", code: "zernio_key_missing", note }, final: { status: "blocked", result: { outcome: "zernio_key_missing", exitCode: 1 } } };
    }
    case "no_account": {
      const note = "Kayıtlı reklam hesabı yok (npm run ads -- link): okunacak bir şey yok.";
      return { step: { status: "skipped", code: "no_targets", note }, final: { status: "succeeded", result: { outcome: "no_targets", exitCode: 2 } } };
    }
    case "provider_error": {
      const done = `${countsNote(run.counts)}${run.failures.length > 1 ? failuresNote(run.failures) : ""}`;
      switch (run.error) {
        case "auth":
          return { step: { status: "needs_approval", code: "zernio_key_missing", note: `Zernio anahtarı reddedildi (yetkisiz). Yazılan: ${done}` }, final: { status: "blocked", result: { outcome: "zernio_key_missing", exitCode: 1 } } };
        case "plan_required":
          return { step: { status: "failed", code: "error", note: `Zernio planı reklam verisini içermiyor (reklam eklentisi gerekli). Yazılan: ${done}` }, final: { status: "blocked", result: { outcome: "error", exitCode: 1 } } };
        case "currency_mismatch":
          return { step: { status: "failed", code: "step_failed", note: `Zernio'dan okunan para birimi kayıtlı hesabınkinden farklı: hiçbir tutar yazılmadı. Yazılan: ${done}` }, final: { status: run.counts.accounts > 0 ? "partial" : "failed", result: { outcome: "step_failed", exitCode: 1 } } };
        default:
          return { step: { status: "failed", code: "step_failed", note: `Zernio reklam okuması başarısız (${run.error}). Yazılan: ${done}` }, final: { status: run.counts.accounts > 0 ? "partial" : "failed", result: { outcome: "step_failed", exitCode: 1 } } };
      }
    }
    case "partial":
      // Yazılanlar kalır; düşenler/eşleşmeyenler notta. Kod `step_failed` (var olan kodlar; yeni kod sıralı dosyada), çıkış 4 (kısmi) betiklerle aynı.
      return { step: { status: "failed", code: "step_failed", note: `Kısmen eşitlendi: ${countsNote(run.counts)}${failuresNote(run.failures)}` }, final: { status: "partial", result: { outcome: "step_failed", exitCode: 4 } } };
    case "synced":
      return { step: { status: "ok", note: countsNote(run.counts) }, final: { status: "succeeded", result: { exitCode: 0 } } };
  }
}
