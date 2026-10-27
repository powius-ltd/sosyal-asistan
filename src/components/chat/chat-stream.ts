import { parseChatEvent, type ChatEvent, type ChatStage } from "@/lib/agents/chat/events";
import { CHAT_ERROR_MESSAGE } from "@/lib/agents/chat/messages";
import type { ChatHistoryMessage } from "@/lib/agents/chat/request";
import { API_ROUTES } from "@/lib/routes";

/** Bağlantı kopması ya da yanıt okunamaması: sunucunun mesajı yoktur, istemci söyler. */
export const CHAT_UNREACHABLE_MESSAGE = "Sohbete ulaşamadım. Bağlantını kontrol edip tekrar dene.";

export type ChatTerminalEvent = Extract<ChatEvent, { type: "answer" | "error" }>;

export interface AskChatOptions {
  question: string;
  /** Önceki konuşma (yalnız kullanıcı soruları ve yanıt metinleri; sunucu son 6'yı alır). */
  history: readonly ChatHistoryMessage[];
  signal: AbortSignal;
  onStage: (stage: ChatStage) => void;
}

const unreachable = (): ChatTerminalEvent => ({ type: "error", code: "failed", message: CHAT_UNREACHABLE_MESSAGE });

/**
 * Soruyu `POST /api/sohbet`'e gönderir ve NDJSON olaylarını okur: `stage` olayları `onStage`'e, ilk `answer`/`error` olayı sonuç olarak döner.
 * Ağ hatası ya da kesik/boş yanıt Türkçe hata olayına çevrilir. İptal (`signal`) FIRLATIR (`AbortError`): çağıran iptali ayırt eder.
 */
export async function askChat({ question, history, signal, onStage }: AskChatOptions): Promise<ChatTerminalEvent> {
  let response: Response;
  try {
    response = await fetch(API_ROUTES.chat, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return unreachable();
  }
  if (response.body === null) return unreachable();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (line: string): ChatTerminalEvent | undefined => {
    const event = parseChatEvent(line);
    if (event === undefined) return undefined;
    if (event.type === "stage") {
      onStage(event.stage);
      return undefined;
    }
    return event;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const terminal = handle(line);
        if (terminal !== undefined) return terminal;
      }
      if (done) break;
    }
    const last = handle(buffer);
    if (last !== undefined) return last;
  } catch (error) {
    if (signal.aborted) throw error;
    return unreachable();
  } finally {
    reader.cancel().catch(() => undefined);
  }
  // Akış sonuç olayı olmadan bitti: sunucu kesildi ya da beklenmedik bir yanıt.
  return response.ok ? unreachable() : { type: "error", code: response.status === 503 ? "unavailable" : "failed", message: response.status === 503 ? CHAT_ERROR_MESSAGE.unavailable : CHAT_UNREACHABLE_MESSAGE };
}
