/**
 * `POST /api/sohbet` işleyicisi (route dosyası yalnız bunu çağırır; bağımlılıklar enjekte edilir, test edilebilir). Sıra:
 * kullanılabilirlik (503) → kaynak/içerik türü (403/415) → gövde sınırı + zod (413/400) → çalışma alanı `getPanelContext()`'ten
 * (GÖVDEDEN DEĞİL) → çalışma alanı başına tek çağrı kilidi (429) → NDJSON akışı: `stage` olayları, sonra `answer` YA DA `error`.
 * Yanıt ancak doğrulamadan SONRA gelir (`answer.ts`). İstemci kopunca (`request.signal` ya da akış iptali) iptal sinyali verilir
 * (`runner.ts`); kilit alt süreç gerçekten bitince bırakılır. Hata ayrıntısı istemciye sızmaz (Türkçe kısa mesaj; sebep günlüğe).
 * Koşu kaydı: LLM çağrıldıysa soru başına 1 satır (`run-record.ts`), soru metni YAZILMAZ; kayıt hatası yanıtı bozmaz.
 */
import "server-only";

import type { FactsContext, FactsOptions } from "@/lib/agents/analyst/facts";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { answerChat, type ChatResult } from "@/lib/agents/chat/answer";
import type { ChatAvailability } from "@/lib/agents/chat/availability";
import { encodeChatEvent, type ChatErrorCode, type ChatEvent } from "@/lib/agents/chat/events";
import type { ChatLock } from "@/lib/agents/chat/lock";
import { runChatTicketCommand } from "@/lib/agents/chat/ticket-command";
import { saveChatIdea } from "@/lib/agents/chat/save-idea";
import { CHAT_ERROR_MESSAGE } from "@/lib/agents/chat/messages";
import { CHAT_BODY_MAX_BYTES } from "@/lib/agents/chat/limits";
import { parseChatRequest } from "@/lib/agents/chat/request";
import { isJsonRequest, isSameOriginRequest, readBodyCapped } from "@/lib/agents/chat/request-guard";
import type { ChatRunRecorder } from "@/lib/agents/chat/run-record";
import type { LlmBackend } from "@/lib/llm/types";

/** İsteğin toplam süre tavanı (olgu paketi + model çağrıları + düzeltme turu). */
export const CHAT_TOTAL_MS = 90_000;

export interface ChatHandlerDeps {
  availability: () => ChatAvailability;
  /** Çalışma alanı + depo + tek saat: panel bağlamı (`getPanelContext`). Gövdeden hiçbir kimlik okunmaz. */
  getContext: () => Promise<FactsContext>;
  /** Bu isteğe özel LLM arka ucu (iptal sinyali ve toplam süre tavanıyla). */
  createBackend: (options: { signal: AbortSignal; totalMs: number }) => LlmBackend;
  recorder: ChatRunRecorder;
  lock: ChatLock;
  /**
   * "Şunu yap" emri: iş yaptırma kapısı AÇIKSA ajan turunu çalıştırır ve tek cümle sonuç metni döner; kapalıysa (müşteri görünümü, işçi yok,
   * örnek veri) undefined → sohbet eski davranışıyla "yalnız okurum" der. Ajanın kapısı (`director/guard.ts`) yine aynıdır.
   */
  delegate?: (ctx: { workspaceId: string }, instruction: string) => Promise<string | undefined>;
  /** Çalışma alanı slug'ı (fiş hesap kimliği); verilmezse fiş kendi hesabın @handle'ından kurulur. */
  panelSlug?: (workspaceId: string) => Promise<string | undefined>;
  /** Olgu paketi toplayıcı (test). */
  collect?: (ctx: FactsContext, options?: FactsOptions) => Promise<BriefingFacts>;
  /** Hata günlüğü (soru/yanıt metni ve hata ayrıntısı YAZILMAZ). */
  log?: (line: string) => void;
  /** Bilgi günlüğü: yanıt türü, deneme sayısı, süre (içerik yok). */
  info?: (line: string) => void;
}

const HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  // `no-transform`: sıkıştırma ara belleği aşama olaylarını yanıtın sonuna ötelemesin.
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Akış başlamadan önceki ret: tek satırlık NDJSON gövde, uygun HTTP durumu. */
function reject(status: number, code: ChatErrorCode): Response {
  return new Response(encodeChatEvent({ type: "error", code, message: CHAT_ERROR_MESSAGE[code] }), { status, headers: HEADERS });
}

async function recordRun(deps: ChatHandlerDeps, workspaceId: string, result: ChatResult): Promise<void> {
  if (!result.llmCalled) return; // LLM çağrılmadı: harcama yok, satır yok
  try {
    if (result.ok && result.meta !== undefined) await deps.recorder.succeeded(workspaceId, result.meta);
    else if (!result.ok) await deps.recorder.failed(workspaceId, `chat_${result.llmCode ?? result.code}`);
  } catch {
    deps.log?.("koşu kaydı yazılamadı");
  }
}

export async function handleChatRequest(request: Request, deps: ChatHandlerDeps): Promise<Response> {
  if (!deps.availability().available) return reject(503, "unavailable");
  if (!isSameOriginRequest(request.headers)) return reject(403, "forbidden");
  if (!isJsonRequest(request.headers)) return reject(415, "invalid_request");

  const raw = await readBodyCapped(request, CHAT_BODY_MAX_BYTES);
  if (raw === undefined) return reject(413, "invalid_request");
  const parsed = parseChatRequest(raw);
  if (!parsed.ok) return reject(400, "invalid_request");

  let ctx: FactsContext;
  try {
    ctx = await deps.getContext();
  } catch {
    deps.log?.("çalışma alanı çözülemedi");
    return reject(500, "failed");
  }

  const release = deps.lock.acquire(ctx.workspaceId);
  if (release === undefined) return reject(429, "busy");

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          closed = true; // istemci gitti
        }
      };
      try {
        const startedAt = performance.now();
        const llm = deps.createBackend({ signal: abort.signal, totalMs: CHAT_TOTAL_MS });
        const result = await answerChat(ctx, parsed.value, { llm, signal: abort.signal, onStage: (stage) => send({ type: "stage", stage }), collect: deps.collect, log: deps.log });
        const seconds = Math.round((performance.now() - startedAt) / 100) / 10;
        deps.info?.(result.ok ? `yanıt: ${result.answer.kind}, deneme ${result.meta?.attempts ?? 0}, ${seconds} sn` : `hata: ${result.code}, ${seconds} sn`);
        let delegated: string | undefined;
        if (result.ok && result.command === "delegate" && deps.delegate !== undefined) {
          try {
            delegated = await deps.delegate({ workspaceId: ctx.workspaceId }, parsed.value.question);
          } catch {
            deps.log?.("ajan emri uygulanamadı");
          }
        }
        if (result.ok && result.command === "save_idea") {
          // Fikir kaydı: doğrulanmış yanıta tek cümle eklenir; kayıt başarısızsa kayıt cümlesinin yerine kısa "kaydedemedim" gelir (yanıt kalır).
          const note = await saveChatIdea(ctx, result.idea, deps.log);
          send({ ...result.answer, text: `${result.answer.text} ${note}` });
        } else if (result.ok && (result.command === "select_idea" || result.command === "write_ticket" || result.command === "update_ticket") && result.ticket !== undefined) {
          // Plan fikri / fiş komutu: sunucu doğrular ve uygular; sonuç cümlesi (bağlantı dahil) yanıta eklenir.
          const panelSlug = await deps.panelSlug?.(ctx.workspaceId).catch(() => undefined);
          const note = await runChatTicketCommand({ ...ctx, panelSlug }, result.command, result.ticket, deps.log);
          send({ ...result.answer, text: `${result.answer.text} ${note}` });
        } else if (delegated !== undefined) send({ type: "answer", kind: "answer", text: delegated, evidence: [] });
        else send(result.ok ? result.answer : { type: "error", code: result.code, message: result.message });
        await recordRun(deps, ctx.workspaceId, result);
      } catch {
        deps.log?.("sohbet akışı beklenmedik biçimde bitti");
        send({ type: "error", code: "failed", message: CHAT_ERROR_MESSAGE.failed });
      } finally {
        release();
        request.signal.removeEventListener("abort", onClientAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // zaten kapandı
          }
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(body, { status: 200, headers: HEADERS });
}
