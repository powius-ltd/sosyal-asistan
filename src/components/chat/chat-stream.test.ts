import { afterEach, describe, expect, it, vi } from "vitest";

import { askChat, CHAT_UNREACHABLE_MESSAGE } from "@/components/chat/chat-stream";
import { liveResponse, mockFetch, ndjson } from "@/components/chat/chat-test-support";
import { encodeChatEvent, type ChatStage } from "@/lib/agents/chat/events";
import { CHAT_ERROR_MESSAGE } from "@/lib/agents/chat/messages";

afterEach(() => vi.unstubAllGlobals());

const base = () => ({ question: "Soru", history: [], signal: new AbortController().signal, onStage: vi.fn<(stage: ChatStage) => void>() });

describe("askChat (NDJSON istemcisi)", () => {
  it("POST /api/sohbet: JSON gövde; aşama olayları onStage'e, ilk answer sonuç olarak döner", async () => {
    const fetchFn = mockFetch(ndjson([{ type: "stage", stage: "facts" }, { type: "stage", stage: "writing" }, { type: "answer", kind: "answer", text: "Yanıt", confidence: "low", evidence: ["c:ci_1"] }]));
    const options = base();
    const result = await askChat({ ...options, question: "Bu hafta ne çekmeliyim?", history: [{ role: "user", text: "önceki" }] });

    expect(result).toEqual({ type: "answer", kind: "answer", text: "Yanıt", confidence: "low", evidence: ["c:ci_1"] });
    expect(options.onStage.mock.calls.map(([stage]) => stage)).toEqual(["facts", "writing"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/sohbet");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ question: "Bu hafta ne çekmeliyim?", history: [{ role: "user", text: "önceki" }] });
  });

  it("satırlar parça sınırlarında bölünse de doğru okunur (satır ortasında kesilen JSON)", async () => {
    const live = liveResponse();
    mockFetch(live.response);
    const stages: string[] = [];
    const pending = askChat({ ...base(), onStage: (stage) => stages.push(stage) });
    const line = encodeChatEvent({ type: "answer", kind: "no_data", text: "Veri yok.", evidence: [] });
    live.push({ type: "stage", stage: "facts" });
    live.pushRaw(line.slice(0, 20));
    live.pushRaw(line.slice(20));
    live.close();
    await expect(pending).resolves.toMatchObject({ type: "answer", kind: "no_data", text: "Veri yok." });
    expect(stages).toEqual(["facts"]);
  });

  it("sunucu hata olayı (429/503 gövdesi) olduğu gibi döner", async () => {
    mockFetch(ndjson([{ type: "error", code: "busy", message: CHAT_ERROR_MESSAGE.busy }], { status: 429 }));
    await expect(askChat(base())).resolves.toEqual({ type: "error", code: "busy", message: CHAT_ERROR_MESSAGE.busy });
  });

  it("ağ hatası Türkçe hata olayına çevrilir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(askChat(base())).resolves.toEqual({ type: "error", code: "failed", message: CHAT_UNREACHABLE_MESSAGE });
  });

  it("sonuç olayı olmadan biten akış hata sayılır; 503 gövdesiz kullanılamıyor", async () => {
    mockFetch(ndjson([{ type: "stage", stage: "facts" }]));
    await expect(askChat(base())).resolves.toMatchObject({ type: "error", message: CHAT_UNREACHABLE_MESSAGE });
    mockFetch(new Response("", { status: 503 }));
    await expect(askChat(base())).resolves.toMatchObject({ type: "error", code: "unavailable", message: CHAT_ERROR_MESSAGE.unavailable });
  });

  it("bozuk satırlar yok sayılır", async () => {
    mockFetch(new Response(`{bozuk\n${encodeChatEvent({ type: "answer", kind: "out_of_scope", text: "Okurum.", evidence: [] })}`, { status: 200 }));
    await expect(askChat(base())).resolves.toMatchObject({ type: "answer", kind: "out_of_scope" });
  });

  it("iptal edilince fırlatır (çağıran 'Vazgeç'i ayırt eder)", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("iptal", "AbortError"))))),
    );
    const pending = askChat({ ...base(), signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
