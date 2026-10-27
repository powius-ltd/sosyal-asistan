/**
 * İş action'larının kullanıcıya dönen metinleri — TEK yerde (Türkçe, düz dil: panel jargonu, sağlayıcı adı, komut yok; `PANEL_JARGON`
 * testi korur). İş türü / adım / durum cümleleri burada DEĞİL sözlüktedir (`lib/plain-language.ts`); burası yalnız action'ın ret ve
 * özet cümleleridir. Depo hata kodu → mesaj çevirisi ortak yardımcıda kalır (`toActionError`); buradaki tablolar ona `overrides` olarak verilir.
 */
import type { RepositoryErrorCode } from "@/lib/data/repository";
import { formatNumber } from "@/lib/format";
import type { JobsGateClosedReason } from "@/lib/job-control/gate";

/** Kapı kapalıyken (`invalid_state`) söylenen neden. */
export const JOBS_GATE_MESSAGE: Record<JobsGateClosedReason, string> = {
  operator_off: "İşler yalnız yönetici modunda başlatılıp durdurulabilir.",
  hosted: "Bu ortamda panelden iş başlatılamıyor.",
  data_source: "Örnek veriyle çalışırken iş başlatılamıyor.",
  worker_missing: "İşleri yürüten program bulunamadı; iş başlatılamıyor.",
  not_ready: "İş başlatma henüz kullanılamıyor.",
};

type Overrides = Partial<Record<RepositoryErrorCode, string>>;

export const REQUEST_JOB_MESSAGES: Overrides = {
  already_exists: "Bu hesapta zaten sırada ya da çalışan bir iş var. Bitmesini bekle ya da önce onu durdur.",
  invalid_input: "İş isteği geçersiz. Sayfayı yenileyip tekrar dene.",
  not_found: "Hesap bulunamadı. Sayfayı yenileyip tekrar dene.",
};

export const CANCEL_JOB_MESSAGES: Overrides = {
  invalid_state: "Bu iş zaten bitmiş; durdurulacak bir şey yok.",
  not_found: "İş bulunamadı. Sayfayı yenileyip tekrar dene.",
};

/** Şema hatasında ilk sorunun mesajı yoksa söylenen cümle. */
export const REQUEST_JOB_INVALID = "İş isteği geçersiz.";

/** İşçi süreci başlatılamadı (iş sırada kalır; teknik neden yalnız sunucu günlüğünde). */
export const WORKER_START_FAILED = "İşi yürütecek program başlatılamadı. Biraz sonra tekrar dene.";

/** İşçi bu kurulumda hiç başlatılamaz (eksik dosya): iş sıraya yazılmadan reddedilir (`invalid_state`). */
export const WORKER_NOT_READY = "İşi yürütecek program bu kurulumda hazır değil; iş başlatılmadı.";

const accounts = (count: number) => `${formatNumber(count)} hesapta`;

/** "Tüm hesaplar" sonucunun sayıları (`RoutineForAllOutcome`'un gösterilen kısmı). */
export interface RoutineForAllCounts {
  requested: number;
  skipped: number;
  failed: number;
}

/**
 * "Tüm hesaplar" özeti — TEK cümle kurucu (action'ın tam başarısızlık mesajı ve ekrandaki sonuç satırı aynısını kullanır): açılan, atlanan
 * ve açılamayan sayıları ayrı ayrı söyler; açılamayan varsa ilkinin nedenini (`failureReason`) ekler. Açılan işler geri alınmaz; cümle
 * kısmi başarıyı gizlemez. Saf: istemci bileşeni de içe aktarabilir.
 */
export function routineForAllSummary(outcome: RoutineForAllCounts, failureReason?: string): string {
  const opened =
    outcome.requested > 0
      ? `${accounts(outcome.requested)} haftalık tur sıraya yazıldı.`
      : outcome.failed > 0
        ? "Hiçbir hesapta haftalık tur başlatılamadı."
        : "Yeni tur başlatılmadı.";
  const parts = [
    opened,
    ...(outcome.skipped > 0 ? [`${accounts(outcome.skipped)} zaten sırada ya da çalışan bir iş vardı.`] : []),
    ...(outcome.failed > 0 ? [`${accounts(outcome.failed)} başlatılamadı${failureReason ? `: ${failureReason}` : "."}`] : []),
  ];
  return parts.join(" ");
}
