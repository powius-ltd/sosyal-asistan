/**
 * Sohbetin sabit Türkçe metinleri (SAF; sunucu üretir, istemci gösterir). Hata iletileri kısadır ve ayrıntı sızdırmaz (sebep günlükte).
 * Ton `persona.ts` kurallarına uyar: "sen", birinci tekil, sakin, ünlemsiz.
 */
import type { ChatErrorCode } from "@/lib/agents/chat/events";
import { CHAT_QUESTION_MAX } from "@/lib/agents/chat/limits";
import { ROUTES } from "@/lib/routes";

export const CHAT_ERROR_MESSAGE: Record<ChatErrorCode, string> = {
  unavailable: "Sohbet şu an kullanılamıyor.",
  forbidden: "Bu istek kabul edilmedi.",
  invalid_request: `Soruyu okuyamadım. En çok ${CHAT_QUESTION_MAX} karakterlik bir soru yaz.`,
  busy: "Önceki sorunu hâlâ yanıtlıyorum. Bitince yeniden sor.",
  timeout: "Yanıt çok uzun sürdü, bitiremedim. Soruyu kısaltıp tekrar dene.",
  no_evidence: "Bu soruya kanıtlı yanıt kuramadım; soruyu daraltır mısın?",
  failed: "Bir sorun çıktı, yanıt veremedim. Biraz sonra tekrar dene.",
  aborted: "Vazgeçildi.",
};

/** Olgu paketinde hiç olgu yokken (LLM çağrılmadan) verilen yanıt. */
export const CHAT_NO_DATA_TEXT = "Henüz hesabının verisine yeterince bakamadım, bu yüzden bu soruya yanıt veremem. İlk bakıştan sonra tekrar sor.";

/** Elle fikir kaydı (`command: "save_idea"`): kaydedilince yanıta eklenen cümle; başlık kullanıcının kendi sözüdür. */
export const chatIdeaSavedText = (title: string): string => `Fikrini kaydettim: “${title}”. Fikirler ekranında “senin fikrin” olarak duruyor, plana da girdi olacak.`;

/** Fikir kaydedilemedi (doğrulama ya da depo hatası): yanıttaki kayıt cümlesinin yerine geçer. */
export const CHAT_IDEA_NOT_SAVED_TEXT = "Fikrini kaydedemedim. Biraz sonra yeniden söyler misin?";

/** Fiş sayfasının yolu (sohbet ekranı bu yolu bağlantıya çevirir: `components/chat/chat-text.tsx`). */
export const chatTicketHref = (orderId: string): string => ROUTES.ticket(orderId);

export const CHAT_TICKET_TEXT = {
  notInPlan: "Bu fikir bu haftanın planında görünmüyor; planındaki fikirlerden birini söyler misin?",
  noOrder: "Bu fikrin henüz bir fişi yok. Önce fişini yazmamı ister misin?",
  dismissed: "Bu fikri daha önce bıraktın; önce Fikirler ekranından geri almalısın.",
  published: "Bu fikir zaten yayınlandı; yeniden seçemem.",
  notDraft: "Bu fişin üretimi başlamış, artık değiştiremem.",
  failed: "Bunu şimdi yapamadım. Biraz sonra yeniden söyler misin?",
  alreadySelected: (title: string) => `“${title}” zaten seçili.`,
  selected: (title: string) => `“${title}” fikrini seçtim.`,
  written: (title: string, href: string) => `“${title}” için fişi yazdım: ${href}`,
  existing: (title: string, href: string) => `“${title}” için fiş zaten vardı: ${href}`,
  updated: (href: string) => `Fişi güncelledim: ${href}`,
} as const;
