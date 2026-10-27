/**
 * Sohbet isteği gövdesi (`POST /api/sohbet`) — TEK doğrulama. İstemciye güvenilmez: alanlar katıdır (bilinmeyen alan reddedilir; çalışma
 * alanı gövdede YOKTUR, `getPanelContext()`'ten çözülür), soru ≤ 500 karakter, geçmiş yalnız son 6 mesaj ve her mesaj kırpılır. Geçmiş
 * istemciden geldiği için ASSISTANT mesajları da güvenilmez veridir (istem onları veri bloğuna koyar, talimat saymaz). Saf; LLM/DB yok.
 */
import { z } from "zod";

import { CHAT_HISTORY_KEEP, CHAT_HISTORY_TEXT_MAX, CHAT_QUESTION_MAX } from "@/lib/agents/chat/limits";

/** Gövdede kabul edilen en çok geçmiş mesajı (istemci hatası/kötüye kullanım: gerisi reddedilir, kırpılmaz). */
const CHAT_HISTORY_ACCEPT = 24;

/** Kod noktası sayımı (UTF-16 uzunluğu değil: emoji iki sayılmasın). */
const codePoints = (text: string): number => [...text].length;
const clip = (text: string, max: number): string => (codePoints(text) <= max ? text : [...text].slice(0, max).join("").trimEnd());

const questionSchema = z
  .string()
  .trim()
  .min(1, "Soru boş olamaz")
  .refine((text) => codePoints(text) <= CHAT_QUESTION_MAX, `Soru en çok ${CHAT_QUESTION_MAX} karakter olabilir`);

const historyMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z
    .string()
    .trim()
    .min(1)
    .transform((text) => clip(text, CHAT_HISTORY_TEXT_MAX)),
});

export const chatRequestSchema = z.strictObject({
  question: questionSchema,
  history: z
    .array(historyMessageSchema)
    .max(CHAT_HISTORY_ACCEPT)
    .default([])
    .transform((messages) => messages.slice(-CHAT_HISTORY_KEEP)),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryMessage = ChatRequest["history"][number];

export type ParsedChatRequest = { ok: true; value: ChatRequest } | { ok: false };

/** Ham JSON metnini doğrular. Hata ayrıntısı döndürülmez (istemciye sızacak bir şey yok). */
export function parseChatRequest(rawBody: string): ParsedChatRequest {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false };
  }
  const parsed = chatRequestSchema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}
