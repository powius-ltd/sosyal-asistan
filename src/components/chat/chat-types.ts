import type { ChatAnswerKind, ChatErrorCode } from "@/lib/agents/chat/events";
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

/** Konuşmadaki bir mesaj (yalnız istemci durumunda tutulur; sayfa yenilenince ve çalışma alanı değişince silinir). */
export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; kind: ChatAnswerKind; text: string; confidence?: ConfidenceLevel; evidence: BriefingEvidenceRef[] }
  /** Başarısız soru: `question` "Tekrar dene" için saklanır. */
  | { id: number; role: "error"; code: ChatErrorCode; message: string; question: string };

/** Yanıt beklenirken gösterilen durum: gerçek aşama + 10 sn sonra "biraz sürebilir". */
export interface ChatPending {
  stage: "facts" | "writing";
  slow: boolean;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Henüz kimliği verilmemiş mesaj (kimliği durum kancası verir). */
export type NewChatMessage = WithoutId<ChatMessage>;
