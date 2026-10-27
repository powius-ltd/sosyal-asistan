/**
 * Yayın formunun alan hata metinleri ve "hangi alanın hatası" eşlemesi (D2-09). Sunucu action'ı (`publish-job-input.ts`) ve form AYNI
 * sabitleri kullanır: sunucudan dönen hata, metne bakılarak ilgili alana bağlanır (hata alanın altında görünür, odak oraya gider).
 */
import { CAPTION_REQUIRED_MESSAGE } from "@/lib/domain/publish";

export const PAST_SCHEDULE_MESSAGE = "Planlanan zaman geçmişte olamaz.";
export const INVALID_SCHEDULE_MESSAGE = "Planlanan zaman geçersiz.";
export const ACCOUNT_REQUIRED_MESSAGE = "Hesap seç.";

export type PublishField = "account" | "caption" | "scheduledAt";

/** Alan kimlikleri (etiket `htmlFor`, `aria-describedby` ve odak buradan). */
export const PUBLISH_FIELD_ID: Record<PublishField, string> = {
  account: "pj-account",
  caption: "pj-caption",
  scheduledAt: "pj-scheduled",
};

/** Sunucu hata metninden alan: tanınmayan metin alana bağlanmaz (toast olarak kalır). */
export function fieldOfMessage(message: string): PublishField | undefined {
  if (message === PAST_SCHEDULE_MESSAGE || message === INVALID_SCHEDULE_MESSAGE) return "scheduledAt";
  if (message === CAPTION_REQUIRED_MESSAGE || message.startsWith("Açıklama")) return "caption";
  if (message.startsWith("Hesap")) return "account";
  return undefined;
}

/** "Kopyala ve düzelt": eski satır iptal edildi ama yenisi açılamadı (dar yarış); durum açıkça söylenir. */
export const REPLACE_HALF_DONE_MESSAGE = "Eski yayın işi iptal edildi ama yenisi açılamadı. Yayın sayfasını yenile; sipariş listede görünmüyorsa yöneticiye haber ver.";
