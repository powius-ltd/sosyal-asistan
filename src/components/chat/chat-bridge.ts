/**
 * Sohbet köprüsü: sayfadaki herhangi bir istemci yaprağı (örn. Bugün'ün haftalık akış şeridi) Asistan'a mesaj gönderir.
 * `window` olayıyla çalışır (modül durumu yok: sohbet düğmesi `key` ile yeniden kurulsa da dinleyici kendi kurulur).
 * Sohbet yuvası çizilmemişse (ortam uygun değil) kimse dinlemez ve `askAssistant` `false` döner.
 */
export const CHAT_ASK_EVENT = "sp-chat-ask";

export interface ChatAskDetail {
  text: string;
  /** Dinleyici mesajı aldıysa `true` yapar. */
  handled: boolean;
}

export function askAssistant(text: string): boolean {
  if (typeof window === "undefined") return false;
  const detail: ChatAskDetail = { text, handled: false };
  window.dispatchEvent(new CustomEvent<ChatAskDetail>(CHAT_ASK_EVENT, { detail }));
  return detail.handled;
}
