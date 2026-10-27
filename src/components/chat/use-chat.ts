"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { askChat } from "@/components/chat/chat-stream";
import type { ChatMessage, ChatPending, NewChatMessage } from "@/components/chat/chat-types";
import { CHAT_HISTORY_KEEP } from "@/lib/agents/chat/limits";
import type { ChatHistoryMessage } from "@/lib/agents/chat/request";

/** Bu kadar bekleyince "Biraz sürebilir" yazılır. */
const SLOW_AFTER_MS = 10_000;

/** Konuşmadan sunucuya giden geçmiş: yalnız soru ve yanıt metinleri (hata/vazgeç mesajları gitmez); son `CHAT_HISTORY_KEEP`. */
export function historyOf(messages: readonly ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .flatMap((message): ChatHistoryMessage[] => (message.role === "error" ? [] : [{ role: message.role, text: message.text }]))
    .slice(-CHAT_HISTORY_KEEP);
}

export interface ChatState {
  messages: ChatMessage[];
  /** Yanıt bekleniyor mu (aynı anda tek soru); bekliyorsa aşama ve "biraz sürebilir" bilgisi. */
  pending?: ChatPending;
  /** Sunucu "kullanılamıyor" dedi: yazma alanı kapanır (tekrar dene başarılı olursa açılır). */
  unavailable: boolean;
  /** Konuşma kapalıyken yeni bir yanıt/hata geldi (çubukta işaret). */
  unseen: boolean;
  send: (question: string) => void;
  retry: (messageId: number) => void;
  cancel: () => void;
  /** Panel açıldı: `unseen` söner. */
  markSeen: () => void;
}

/**
 * Sohbet durumu (yalnız istemcide): konuşma, bekleme durumu, iptal. Geçmiş sunucuya saklanmaz; bileşen kaldırılınca (çalışma alanı
 * değişimi `key` ile) ve sayfa yenilenince silinir. Bekleyen istek bileşen kaldırılırsa iptal edilir. `open`: panel açık mı.
 */
export function useChat(open: boolean): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatPending | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const nextId = useRef(1);
  const controller = useRef<AbortController | undefined>(undefined);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Panel şu an açık mı (yanıt KAPALIYKEN gelirse çubukta "yeni yanıt" işareti). */
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(
    () => () => {
      controller.current?.abort();
      clearTimeout(slowTimer.current);
    },
    [],
  );

  /** Soruyu sunucuya sorar; `history` bu soruyu İÇERMEZ. Sonuç konuşmaya eklenir. */
  const run = useCallback(async (question: string, history: ChatHistoryMessage[]) => {
    const abort = new AbortController();
    controller.current = abort;
    setPending({ stage: "facts", slow: false });
    clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setPending((current) => (current === undefined ? current : { ...current, slow: true })), SLOW_AFTER_MS);

    const add = (message: NewChatMessage) => {
      const id = nextId.current++;
      setMessages((all) => [...all, { ...message, id } as ChatMessage]);
      if (!openRef.current) setUnseen(true);
    };
    try {
      const result = await askChat({ question, history, signal: abort.signal, onStage: (stage) => setPending((current) => (current === undefined ? current : { ...current, stage })) });
      if (result.type === "answer") {
        setUnavailable(false);
        add({ role: "assistant", kind: result.kind, text: result.text, evidence: result.evidence, ...(result.confidence === undefined ? {} : { confidence: result.confidence }) });
      } else {
        setUnavailable(result.code === "unavailable");
        add({ role: "error", code: result.code, message: result.message, question });
      }
    } catch {
      // Yalnız iptal fırlatır ("Vazgeç" ya da bileşen kaldırıldı).
      if (controller.current === abort) add({ role: "error", code: "aborted", message: "Vazgeçtin.", question });
    } finally {
      if (controller.current === abort) {
        controller.current = undefined;
        clearTimeout(slowTimer.current);
        setPending(undefined);
      }
    }
  }, []);

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (question === "" || pending !== undefined) return;
      const history = historyOf(messages);
      setMessages((all) => [...all, { id: nextId.current++, role: "user", text: question }]);
      void run(question, history);
    },
    [messages, pending, run],
  );

  const retry = useCallback(
    (messageId: number) => {
      if (pending !== undefined) return;
      const index = messages.findIndex((message) => message.id === messageId);
      const failed = messages[index];
      if (failed === undefined || failed.role !== "error") return;
      // Soru konuşmada zaten var: hata mesajı kalkar, soru yeniden sorulur (geçmiş = sorudan önceki konuşma).
      const before = messages.slice(0, index);
      const lastUser = before.at(-1);
      const history = historyOf(lastUser?.role === "user" ? before.slice(0, -1) : before);
      setMessages(before);
      if (lastUser?.role !== "user") setMessages((all) => [...all, { id: nextId.current++, role: "user", text: failed.question }]);
      void run(failed.question, history);
    },
    [messages, pending, run],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const markSeen = useCallback(() => setUnseen(false), []);

  return { messages, pending, unavailable, unseen, send, retry, cancel, markSeen };
}
