/**
 * Supabase (PostgREST/Postgres) hatalarını `RepositoryError`'a çevirir. DB constraint ve trigger'ları ikinci
 * savunma hattıdır (depo önce kendi kontrollerini yapar); buraya düşen hata bir yarış ya da atlanmış kontroldür.
 * Ham hata iletisi kullanıcıya SIZMAZ: bilinen kodlar Türkçe sabit metne, bilinmeyenler genel bir hataya çevrilir.
 */
import type { PostgrestError } from "@supabase/supabase-js";

import { InsufficientCreditsError, parseInsufficientDetail } from "@/lib/credits/errors";
import { RepositoryError } from "@/lib/data/repository";
import { ONBOARDING_ERROR } from "@/lib/data/views/onboarding";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID biçimli mi? Kimlik sütunlarına biçimsiz değer gitmesin (Postgres `22P02` verir): biçimsiz kimlik "bulunamadı"dır. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Yalnız UUID biçimli olanlar (sıra korunur). */
export function onlyUuids(values: readonly string[]): string[] {
  return values.filter(isUuid);
}

/** Postgres/PostgREST hata kodu → depo hatası. Eşleşmeyen hata genel (ayrıntısız) `Error` olur ve günlüğe yazılabilir. */
export function toRepositoryError(error: PostgrestError): Error {
  const { code, message } = error;
  switch (code) {
    case "23505":
      // Panel işi: çalışma alanında zaten etkin iş var (`request_panel_job` iletisi ya da tek etkin iş indeksi).
      if (message === "panel_job_active" || message.includes("panel_jobs_one_active_per_workspace")) {
        return new RepositoryError("already_exists", "Bu çalışma alanında zaten sırada ya da çalışan bir iş var.");
      }
      if (message === "credit_hold_active") return new RepositoryError("already_exists", "Bu iş için zaten açık bir kredi ayırması var.");
      // Başlangıç akışı (0021): hesap başına tek ilk tur (kısmi benzersiz indeks) ve kullanıcı başına tekil hesap (`create_workspace`).
      if (message.includes("panel_jobs_one_onboarding_build")) return new RepositoryError("already_exists", ONBOARDING_ERROR.buildExists);
      if (message === "own_account_exists") return new RepositoryError("already_exists", ONBOARDING_ERROR.accountExists);
      return new RepositoryError("already_exists", "Bu kayıt zaten var.");
    case "23503":
      return new RepositoryError("not_found", "Bağlı kayıt bulunamadı.");
    case "22P02":
      return new RepositoryError("invalid_input", "Geçersiz kimlik ya da değer.");
    case "22023":
      // Kredi RPC'lerinin girdi hataları (`credit_*`: geçersiz tutar, anahtar çakışması, gerçekleşen > ayrılan).
      if (message === "credit_idempotency_conflict") return new RepositoryError("invalid_input", "Aynı işlem anahtarı başka bir kredi işlemi için kullanılmış.");
      if (message.startsWith("credit_")) return new RepositoryError("invalid_input", "Kredi işlemi girdisi geçersiz.");
      return new Error(`Supabase hatası (${code}): ${message}`);
    case "23514":
      // Yayın koruma trigger'ı (`publish_*`) ve durum/onay check'leri: durum makinesi bu geçişe izin vermiyor.
      if (message === "publish_approver_not_editor") {
        return new RepositoryError("invalid_state", "Onaylayan kullanıcı bu çalışma alanının editör/sahip üyesi olmalı.");
      }
      if (message.startsWith("publish_") || message.includes("publish_jobs_human_approval") || message.includes("publish_jobs_no_approval")) {
        return new RepositoryError("invalid_state", "Yayın işi bu durumda bu işleme izin vermiyor.");
      }
      // Panel işi koruma trigger'ı / iptal (`panel_job_*`): bitmiş iş, geçersiz geçiş, değişmez alan. Tablo CHECK'leri
      // (`panel_jobs_*`: onaysız harcama, onay kaydı) ise girdi hatasıdır ve aşağıdaki genel dala düşer.
      if (message === "panel_job_approver_not_editor") {
        return new RepositoryError("invalid_state", "Harcamayı onaylayan kullanıcı bu çalışma alanının editör/sahip üyesi olmalı.");
      }
      if (message === "panel_job_onboarding_limit") return new RepositoryError("invalid_state", ONBOARDING_ERROR.limit);
      if (message === "panel_job_onboarding_needs_probe") return new RepositoryError("invalid_state", ONBOARDING_ERROR.needsProbe);
      if (message === "workspace_not_discardable") return new RepositoryError("invalid_state", ONBOARDING_ERROR.notDiscardable);
      if (message.startsWith("panel_job_")) return new RepositoryError("invalid_state", "İş bu durumda bu işleme izin vermiyor.");
      // Kredi defteri korumaları (trigger / RPC iletisi `credit_*`: değişmez defter, kapanmış ayırma, eksi bakiye). Tablo CHECK'lerinin
      // iletisi kısıt adını taşır ("violates check constraint …") ve aşağıdaki genel dala (girdi hatası) düşer.
      if (message.startsWith("credit_")) return new RepositoryError("invalid_state", "Kredi kaydı bu durumda bu işleme izin vermiyor.");
      return new RepositoryError("invalid_input", "Girdi veritabanı kısıtlarına uymuyor.");
    case "42501":
      return new RepositoryError("invalid_state", "Bu işlem için yetki yok.");
    case "P0002":
      if (message === "panel_job_not_found") return new RepositoryError("not_found", "İş bulunamadı.");
      if (message === "credit_hold_not_found") return new RepositoryError("not_found", "Kredi ayırması bulunamadı.");
      return new RepositoryError("not_found", "Workspace bulunamadı.");
    case "P0001":
      if (message === "insufficient_credits") {
        const { available, requested } = parseInsufficientDetail(error.details);
        return new InsufficientCreditsError(requested, available);
      }
      if (message === "budget_exceeded") {
        return new RepositoryError("budget_exceeded", "Aylık bütçe tavanı aşılırdı; işlem başlatılmadı.");
      }
      return new Error(`Veritabanı kuralı reddetti: ${message}`);
    default:
      return new Error(`Supabase hatası (${code || "?"}): ${message}`);
  }
}

/** ISO zaman parametresi geçerli mi (`since`, `from`, `to` ...)? Değilse `invalid_input`; Postgres'e biçimsiz zaman gitmez. */
export function assertIsoInstant(value: string | undefined, what: string): void {
  if (value !== undefined && Number.isNaN(Date.parse(value))) throw new RepositoryError("invalid_input", `Geçersiz ${what}: ${value}`);
}

/** Yanıt türünün BAŞARI dalındaki veri (`error: null` üyesi): liste → dizi, `.single()` → satır, `.maybeSingle()` → satır | null. */
type SuccessData<R> = R extends { error: null; data: infer D } ? D : never;

/**
 * Sonucun verisini döndürür; hata varsa `RepositoryError`/`Error` fırlatır. Tip, yanıtın kendisinden türetilir
 * (`T | null` parametreli genel imza `await`li iç içe çağrıda `T`'yi `null`'a daraltıyordu).
 */
export function unwrap<R extends { data: unknown; error: PostgrestError | null }>(result: R): SuccessData<R> {
  if (result.error) throw toRepositoryError(result.error);
  return result.data as SuccessData<R>;
}
