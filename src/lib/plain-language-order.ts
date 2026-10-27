/** Stüdyo videosu dönüş/yayın bildirimleri ve iş cümleleri (müşteri metni; jargon yok). Tek yer: bildirim ve ekran aynı cümleyi söyler. */

export interface PublishNoticeDraft {
  title: string;
  body: string;
}

export const ORDER_MEDIA_NOTE_PLAIN = "Stüdyo videosu: önizleme burada açılmaz, yayın anında stüdyodan alınır.";

export function orderReadyNotice(input: { orderId: string; scheduleNote?: string }): PublishNoticeDraft {
  return {
    title: "Videon hazır, onayını bekliyor",
    body: `Stüdyodan gelen video yayın onayında (${input.orderId}). Açıklamayı oku, uygunsa onayla.${input.scheduleNote ? ` ${input.scheduleNote}` : ""}`,
  };
}

export function orderDraftNotice(input: { orderId: string; problem: string }): PublishNoticeDraft {
  return {
    title: "Videon hazır, ama açıklama düzeltilmeli",
    body: `Stüdyodan gelen video (${input.orderId}) taslak olarak bekliyor: ${input.problem} Yayın bölümünde düzeltip onaya gönder.`,
  };
}

export const SCHEDULE_PAST_NOTE_PLAIN = "İstenen saat geçmişte kaldı; yeni bir saat seç.";
export const AI_DISCLOSURE_PROBLEM_PLAIN = "Yapay zekâ ile üretildiği için açıklamaya açık bir beyan eklenmeli.";

export function orderStuckNotice(input: { orderId: string }): PublishNoticeDraft {
  return { title: "Videonun yayın durumu doğrulanamadı", body: `Stüdyo videosu (${input.orderId}) gönderilirken yanıt alınamadı. Zernio'da gönderiyi elle kontrol et; ikinci kez gönderilmez.` };
}

export function orderUnverifiedNotice(input: { orderId: string }): PublishNoticeDraft {
  return { title: "Videonun yayını doğrulanamadı", body: `Stüdyo videosunun (${input.orderId}) yayın saatinin üstünden 24 saatten fazla geçti ama Zernio'dan yayında olduğu doğrulanamadı. Instagram ve Zernio'da gönderiyi elle kontrol et; ikinci kez gönderilmez.` };
}

export function orderPublishedNotice(input: { orderId: string; url?: string }): PublishNoticeDraft {
  return { title: "Videon yayında", body: `Stüdyo videosu (${input.orderId}) yayınlandı.${input.url ? ` ${input.url}` : ""}` };
}
