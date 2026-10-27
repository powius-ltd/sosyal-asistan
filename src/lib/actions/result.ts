/**
 * Server action'ların ORTAK sonuç tipi ve hata çevirisi. `src/app/actions/**` hepsi buradan alır;
 * `RepositoryError` → kullanıcıya Türkçe mesaj çevirisi başka hiçbir yerde yazılmaz.
 *
 * Kurallar:
 *  - Başarısızlıkta `message` her zaman Türkçe ve kullanıcıya gösterilebilir; beklenmeyen hatanın
 *    ayrıntısı (ör. veritabanı mesajı) istemciye SIZMAZ, yalnız sunucu günlüğüne yazılır.
 *  - `code`, depo hata kodunu taşır (`RepositoryErrorCode`); doğrulama hatası `invalid_input`,
 *    beklenmeyen hata `unknown`.
 *  - İstemci bileşenleri bu dosyadan YALNIZ `import type` yapar (çalışma zamanı kodu sunucuya aittir).
 */
import type { ZodError } from "zod";

import { ComplianceFailedError, RepositoryError, type RepositoryErrorCode } from "@/lib/data/repository";

export type ActionErrorCode = RepositoryErrorCode | "unknown";

export interface ActionFailure {
  ok: false;
  code: ActionErrorCode;
  message: string;
}

/** `T`: başarıda dönen ek alanlar (ör. `{ message: string }`, `{ ideaId: string }`). */
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

export const ACTION_OK: ActionResult = { ok: true };

/** Ek veriyle başarı: `actionOk({ message: "Kaydedildi." })`. */
export function actionOk<T extends object>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}

export function actionFail(message: string, code: ActionErrorCode = "invalid_input"): ActionFailure {
  return { ok: false, code, message };
}

/** Şema (zod) hatası: ilk sorunun mesajı; yoksa `fallback`. */
export function validationFail(error: ZodError, fallback = "Girilen bilgiler geçersiz."): ActionFailure {
  return actionFail(error.issues[0]?.message ?? fallback, "invalid_input");
}

/** Depo hata kodlarının varsayılan Türkçe mesajları (bağlama özel metin için `overrides`). */
const MESSAGES: Record<ActionErrorCode, string> = {
  not_found: "Kayıt bulunamadı. Sayfayı yenileyip tekrar dene.",
  invalid_state: "Bu işlem kaydın şu anki durumunda yapılamıyor. Sayfa güncel olmayabilir; yenileyip tekrar dene.",
  invalid_input: "Girilen bilgiler geçersiz.",
  already_exists: "Bu kayıt zaten var.",
  budget_exceeded: "Aylık bütçe tavanı aşılacağı için işlem başlatılmadı. Ayarlar'dan tavanı yükseltebilirsin.",
  insufficient_credits: "Kredin bu iş için yetmiyor; iş başlatılmadı.",
  not_implemented: "Bu özellik henüz kullanılamıyor.",
  unknown: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
};

/**
 * Yakalanan hatayı sonuca çevirir. `RepositoryError` koduna göre Türkçe mesaj verir; `overrides` yalnız
 * bağlama özel metin içindir (ör. "@kahve zaten ekli."). Bilinmeyen hata günlüğe yazılır, genel mesaj döner.
 */
export function toActionError(
  error: unknown,
  overrides: Partial<Record<RepositoryErrorCode, string>> = {},
): ActionFailure {
  // Uyum denetimi engeli: mesaj kullanıcıya özel Türkçe metindir (hangi kuralın neden başarısız olduğu), bağlam metniyle ezilmez.
  if (error instanceof ComplianceFailedError) return actionFail(error.message, error.code);
  if (error instanceof RepositoryError) return actionFail(overrides[error.code] ?? MESSAGES[error.code], error.code);
  console.error("[action] beklenmeyen hata", error);
  return actionFail(MESSAGES.unknown, "unknown");
}
