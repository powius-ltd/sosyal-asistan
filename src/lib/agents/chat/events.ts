/**
 * Sohbet kutusu protokolü (sunucu ↔ istemci ortak, SAF: LLM/DB/Next yok). `POST /api/sohbet` yanıtı NDJSON'dur: her satır bir olay.
 * Sıra: `stage` (0..n) → tam bir `answer` YA DA `error`. Metin harf harf akmaz: yanıt ancak doğrulamadan SONRA (belirteçler
 * yerleştirilmiş, kanıt denetlenmiş) tek olay olarak gelir; `stage` olayları dürüst ilerleme verir. İstemci satırı `parseChatEvent`
 * ile okur: biçimi bozuk satır `undefined` döner (yok sayılır), kanıt ref'leri `isBriefingRef` ile süzülür.
 */
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";
import { isBriefingRef } from "@/lib/domain/briefing-refs";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

/** Yanıt hazırlanırken geçilen aşamalar: verilere bakma → yanıtı yazma. */
export const CHAT_STAGES = ["facts", "writing"] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];

/** `answer` = kanıtlı yanıt · `no_data` = pakette bu soruyu karşılayan veri yok · `out_of_scope` = hesap verisiyle ilgisiz ya da iş yaptırma isteği. */
export const CHAT_ANSWER_KINDS = ["answer", "no_data", "out_of_scope"] as const;
export type ChatAnswerKind = (typeof CHAT_ANSWER_KINDS)[number];

/** İstemciye giden hata kodları (ayrıntı sızmaz; mesaj Türkçe ve kısa). */
export const CHAT_ERROR_CODES = ["unavailable", "forbidden", "invalid_request", "busy", "timeout", "no_evidence", "failed", "aborted"] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export type ChatEvent =
  | { type: "stage"; stage: ChatStage }
  | {
      type: "answer";
      kind: ChatAnswerKind;
      /** Doğrulanmış, sayıları yerleştirilmiş düz metin. */
      text: string;
      /** Yalnız `kind: "answer"`: kanıt ve sayı güvenlerinin en zayıfı. */
      confidence?: ConfidenceLevel;
      /** Yalnız `kind: "answer"`: pakette doğrulanmış kanıt ref'leri. */
      evidence: BriefingEvidenceRef[];
    }
  | { type: "error"; code: ChatErrorCode; message: string };

/** Satıra çevirir (sonunda `\n`). */
export function encodeChatEvent(event: ChatEvent): string {
  return `${JSON.stringify(event)}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const includes = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Bir NDJSON satırını olaya çevirir; boş/bozuk/tanınmayan satır → undefined. */
export function parseChatEvent(line: string): ChatEvent | undefined {
  const trimmed = line.trim();
  if (trimmed === "") return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  if (raw.type === "stage") return includes(CHAT_STAGES, raw.stage) ? { type: "stage", stage: raw.stage } : undefined;
  if (raw.type === "error") {
    return includes(CHAT_ERROR_CODES, raw.code) && typeof raw.message === "string" ? { type: "error", code: raw.code, message: raw.message } : undefined;
  }
  if (raw.type === "answer") {
    if (!includes(CHAT_ANSWER_KINDS, raw.kind) || typeof raw.text !== "string") return undefined;
    const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter(isBriefingRef) : [];
    const confidence = includes(["high", "medium", "low"] as const, raw.confidence) ? raw.confidence : undefined;
    return { type: "answer", kind: raw.kind, text: raw.text, evidence, ...(confidence === undefined ? {} : { confidence }) };
  }
  return undefined;
}
