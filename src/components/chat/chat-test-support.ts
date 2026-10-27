/** Sohbet arayüz testleri için ortak kurulum (yalnız testler import eder): sahte NDJSON yanıtı ve sahte `fetch`. */
import { vi } from "vitest";

import { encodeChatEvent, type ChatEvent } from "@/lib/agents/chat/events";

/** Hazır (bitmiş) NDJSON yanıtı. */
export function ndjson(events: readonly ChatEvent[], init: ResponseInit = { status: 200 }): Response {
  return new Response(events.map(encodeChatEvent).join(""), { ...init, headers: { "Content-Type": "application/x-ndjson" } });
}

/** Elle ilerletilen yanıt: olaylar `push` ile gelir, `close` ile biter. */
export function liveResponse(init: ResponseInit = { status: 200 }) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { ...init, headers: { "Content-Type": "application/x-ndjson" } }),
    push: (event: ChatEvent) => controller.enqueue(encoder.encode(encodeChatEvent(event))),
    pushRaw: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  };
}

/** Çağrıları kaydeden sahte `fetch`: sıradaki yanıtları verir (işlev olabilir: `signal`'a göre bekleyebilir). */
export function mockFetch(...responses: (Response | ((init: RequestInit) => Response | Promise<Response>))[]) {
  const queue = [...responses];
  const fn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === undefined) throw new Error("sahte fetch: yanıt kalmadı");
    return typeof next === "function" ? next(init ?? {}) : next.clone();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** İstek gövdesi (JSON) — `fetch` çağrısı `n`. */
export function bodyOf(fn: ReturnType<typeof mockFetch>, n = 0): { question: string; history: { role: string; text: string }[] } {
  return JSON.parse(String(fn.mock.calls[n][1]?.body));
}
