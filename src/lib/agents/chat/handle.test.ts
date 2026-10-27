import { describe, expect, it, vi } from "vitest";

import { handleChatRequest, type ChatHandlerDeps } from "@/lib/agents/chat/handle";
import { createChatLock } from "@/lib/agents/chat/lock";
import { CHAT_ERROR_MESSAGE, CHAT_IDEA_NOT_SAVED_TEXT, chatIdeaSavedText } from "@/lib/agents/chat/messages";
import { parseChatEvent, type ChatEvent } from "@/lib/agents/chat/events";
import type { ChatRunRecorder } from "@/lib/agents/chat/run-record";
import { createChatRunner } from "@/lib/agents/chat/runner";
import { factsContext, goodOutput, mockFacts, OWN_REF } from "@/lib/agents/chat/test-support";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { createClaudeCliBackend } from "@/lib/llm/claude-cli";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { LlmError, type LlmBackend } from "@/lib/llm/types";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const QUESTION = "Bu hafta ne çekmeliyim? (özel soru metni)";
const URL_ = "http://localhost:3100/api/sohbet";

function post(body: unknown, headers: Record<string, string> = {}, init: RequestInit = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3100", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

const eventsOf = async (response: Response): Promise<ChatEvent[]> =>
  (await response.text())
    .split("\n")
    .map(parseChatEvent)
    .filter((event): event is ChatEvent => event !== undefined);

function makeRecorder() {
  const recorder = { succeeded: vi.fn().mockResolvedValue(undefined), failed: vi.fn().mockResolvedValue(undefined) } satisfies ChatRunRecorder;
  return recorder;
}

function makeDeps(overrides: Partial<ChatHandlerDeps> & { llm?: LlmBackend } = {}) {
  const fake = createFakeLlm(goodOutput());
  const recorder = makeRecorder();
  const createBackend = vi.fn(() => overrides.llm ?? fake.backend);
  const getContext = vi.fn(async () => factsContext());
  const deps: ChatHandlerDeps = {
    availability: () => ({ available: true }),
    getContext,
    createBackend,
    recorder,
    lock: createChatLock(),
    collect: async () => mockFacts(),
    ...overrides,
  };
  return { deps, fake, recorder, createBackend, getContext };
}

describe("POST /api/sohbet: kapı kontrolleri", () => {
  it("LLM arka ucu kullanılamıyorsa 503; ne bağlam okunur ne LLM çağrılır", async () => {
    const { deps, fake, getContext } = makeDeps({ availability: () => ({ available: false, reason: "cli_missing" }) });
    const response = await handleChatRequest(post({ question: QUESTION }), deps);
    expect(response.status).toBe(503);
    expect((await eventsOf(response))[0]).toMatchObject({ type: "error", code: "unavailable" });
    expect(getContext).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });

  it("başka siteden gelen istek reddedilir (403): Sec-Fetch-Site cross-site ve yabancı Origin", async () => {
    const { deps, fake } = makeDeps();
    expect((await handleChatRequest(post({ question: QUESTION }, { "sec-fetch-site": "cross-site" }), deps)).status).toBe(403);
    expect((await handleChatRequest(post({ question: QUESTION }, { "sec-fetch-site": "same-site" }), deps)).status).toBe(403);
    expect((await handleChatRequest(post({ question: QUESTION }, { origin: "http://kotu.example" }), deps)).status).toBe(403);
    expect(fake.calls).toHaveLength(0);
    // Aynı kaynak: geçer.
    const ok = await handleChatRequest(post({ question: QUESTION }, { origin: "http://localhost:3100", "sec-fetch-site": "same-origin" }), deps);
    expect(ok.status).toBe(200);
  });

  it("JSON olmayan içerik türü 415 (başka siteden basit form POST'u CORS ön denetimine takılmaz; biz de reddederiz)", async () => {
    const { deps, fake } = makeDeps();
    const response = await handleChatRequest(post(JSON.stringify({ question: QUESTION }), { "content-type": "text/plain" }), deps);
    expect(response.status).toBe(415);
    expect(fake.calls).toHaveLength(0);
  });

  it("çok büyük gövde 413: Content-Length ile de, akışla gelen gerçek bayt ile de", async () => {
    const { deps, fake } = makeDeps();
    const big = JSON.stringify({ question: "x", history: [], pad: "y".repeat(60_000) });
    expect((await handleChatRequest(post(big, { "content-length": String(big.length) }), deps)).status).toBe(413);
    // Content-Length yok/yalan: akış okunurken sınır uygulanır.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new TextEncoder().encode("a".repeat(10_000));
        for (let i = 0; i < 8; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const streamed = new Request(URL_, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3100" }, body: stream, duplex: "half" } as RequestInit);
    expect((await handleChatRequest(streamed, deps)).status).toBe(413);
    expect(fake.calls).toHaveLength(0);
  });

  it("geçersiz gövde 400: uzun soru, boş soru, bilinmeyen alan (workspaceId dahil), bozuk JSON", async () => {
    const { deps, fake, getContext } = makeDeps();
    for (const body of [{ question: "x".repeat(501) }, { question: " " }, { question: "Merhaba", workspaceId: "ws_baska" }, { question: "Merhaba", history: [{ role: "user", text: "a", gizli: 1 }] }, "{bozuk"]) {
      const response = await handleChatRequest(post(body), deps);
      expect(response.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect((await eventsOf(response))[0]).toMatchObject({ type: "error", code: "invalid_request" });
    }
    expect(getContext).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(0);
  });
});

describe("POST /api/sohbet: çalışma alanı ve kilit", () => {
  it("çalışma alanı gövdeden değil panel bağlamından okunur: kilit ve koşu kaydı bağlamın kimliğiyle", async () => {
    const lock = createChatLock();
    const { deps, recorder } = makeDeps({ lock });
    const acquire = vi.spyOn(lock, "acquire");
    const response = await handleChatRequest(post({ question: QUESTION, history: [] }), deps);
    await response.text();
    expect(acquire).toHaveBeenCalledWith(MOCK_WORKSPACE_ID);
    expect(recorder.succeeded).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, expect.anything());
  });

  it("aynı çalışma alanında eşzamanlı ikinci istek 429 (meşgul); LLM çağrılmaz; ilk bitince tekrar kabul edilir", async () => {
    const lock = createChatLock();
    const { deps, fake } = makeDeps({ lock });
    const release = lock.acquire(MOCK_WORKSPACE_ID); // ilk sorunun hâlâ sürdüğünü taklit eder
    const busy = await handleChatRequest(post({ question: QUESTION }), deps);
    expect(busy.status).toBe(429);
    expect((await eventsOf(busy))[0]).toEqual({ type: "error", code: "busy", message: CHAT_ERROR_MESSAGE.busy });
    expect(fake.calls).toHaveLength(0);
    release?.();
    expect((await handleChatRequest(post({ question: QUESTION }), deps)).status).toBe(200);
  });

  it("kilit yanıt bitince (başarıda da hatada da) bırakılır", async () => {
    const lock = createChatLock();
    const failing: LlmBackend = { id: "claude_cli", runJson: async () => { throw new LlmError("timeout", "zaman aşımı"); } };
    const { deps } = makeDeps({ lock, llm: failing });
    await (await handleChatRequest(post({ question: QUESTION }), deps)).text();
    const release = lock.acquire(MOCK_WORKSPACE_ID);
    expect(release).toBeDefined();
    release?.();
  });
});

describe("POST /api/sohbet: akış", () => {
  it("NDJSON: önce aşama olayları (facts → writing), sonra tek answer; kanıt ve güven ile", async () => {
    const { deps, fake, createBackend } = makeDeps();
    const response = await handleChatRequest(post({ question: QUESTION }), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-store");

    const events = await eventsOf(response);
    expect(events.map((event) => event.type)).toEqual(["stage", "stage", "answer"]);
    expect(events.slice(0, 2)).toEqual([{ type: "stage", stage: "facts" }, { type: "stage", stage: "writing" }]);
    expect(events[2]).toMatchObject({ type: "answer", kind: "answer", evidence: [OWN_REF], confidence: "medium" });
    expect(events[2].type === "answer" && events[2].text).toMatch(/7,2 katı/);
    expect(fake.calls).toHaveLength(1);
    expect(createBackend).toHaveBeenCalledWith(expect.objectContaining({ totalMs: 90_000, signal: expect.any(AbortSignal) }));
  });

  it("olgu paketi boşsa LLM çağrılmaz; sabit veri-yok yanıtı; koşu satırı yazılmaz", async () => {
    const base = await mockFacts();
    const { deps, fake, recorder } = makeDeps({ collect: async () => ({ ...base, refs: new Map() }) });
    const events = await eventsOf(await handleChatRequest(post({ question: QUESTION }), deps));
    expect(events.map((event) => event.type)).toEqual(["stage", "answer"]);
    expect(events[1]).toMatchObject({ kind: "no_data", evidence: [] });
    expect(fake.calls).toHaveLength(0);
    expect(recorder.succeeded).not.toHaveBeenCalled();
    expect(recorder.failed).not.toHaveBeenCalled();
  });

  it("doğrulamadan geçmeyen yanıt GÖSTERİLMEZ: error(no_evidence); metin sızmaz", async () => {
    const bad = createFakeLlm(goodOutput({ text: "Videon 9 kat izlendi.", evidence: ["c:ci_uydurma_7"] }));
    const { deps } = makeDeps({ llm: bad.backend });
    const events = await eventsOf(await handleChatRequest(post({ question: QUESTION }), deps));
    expect(events.at(-1)).toEqual({ type: "error", code: "no_evidence", message: CHAT_ERROR_MESSAGE.no_evidence });
    expect(events.some((event) => event.type === "answer")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("9 kat");
  });

  it("beklenmeyen hata ayrıntısı istemciye sızmaz (Türkçe kısa mesaj)", async () => {
    const leaky: LlmBackend = { id: "claude_cli", runJson: async () => { throw new Error("SECRET_TOKEN=abc123 C:\\gizli\\dizin"); } };
    const { deps } = makeDeps({ llm: leaky });
    const text = await (await handleChatRequest(post({ question: QUESTION }), deps)).text();
    expect(text).not.toMatch(/SECRET|abc123|gizli/);
    expect(parseChatEvent(text.trim().split("\n").at(-1) ?? "")).toEqual({ type: "error", code: "failed", message: CHAT_ERROR_MESSAGE.failed });
  });

  it("LLM zaman aşımı → timeout hatası", async () => {
    const slow: LlmBackend = { id: "claude_cli", runJson: async () => { throw new LlmError("timeout", "Claude CLI zaman aşımı (90 sn)."); } };
    const { deps } = makeDeps({ llm: slow });
    const events = await eventsOf(await handleChatRequest(post({ question: QUESTION }), deps));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "timeout" });
  });
});

describe("POST /api/sohbet: koşu kaydı", () => {
  it("başarılı soru için 1 satır (abonelik meta'sıyla); soru metni hiçbir kayıt çağrısına girmez", async () => {
    const { deps, recorder } = makeDeps();
    await (await handleChatRequest(post({ question: QUESTION, history: [{ role: "user", text: "önceki özel metin" }] }), deps)).text();
    expect(recorder.succeeded).toHaveBeenCalledTimes(1);
    expect(recorder.succeeded).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, expect.objectContaining({ kind: "llm_chat", billing: "subscription", backend: "claude_cli" }));
    expect(recorder.failed).not.toHaveBeenCalled();
    const logged = JSON.stringify([recorder.succeeded.mock.calls, recorder.failed.mock.calls]);
    expect(logged).not.toContain("özel soru metni");
    expect(logged).not.toContain("önceki özel metin");
  });

  it("başarısız çağrı yalnız kısa kodla kaydedilir (hata metni/soru yok)", async () => {
    const bad = createFakeLlm(goodOutput({ evidence: [] }));
    const { deps, recorder } = makeDeps({ llm: bad.backend });
    await (await handleChatRequest(post({ question: QUESTION }), deps)).text();
    expect(recorder.failed).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, "chat_invalid_output");
    expect(JSON.stringify(recorder.failed.mock.calls)).not.toContain("özel soru metni");
  });

  it("bilgi günlüğü yanıt türü, deneme sayısı ve süreyi yazar; soru metnini yazmaz", async () => {
    const info = vi.fn();
    const { deps } = makeDeps({ info });
    await (await handleChatRequest(post({ question: QUESTION }), deps)).text();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^yanıt: answer, deneme 1, [\d.]+ sn$/));
    expect(JSON.stringify(info.mock.calls)).not.toContain("özel soru metni");
  });

  it("kayıt hatası yanıtı bozmaz", async () => {
    const recorder = { succeeded: vi.fn().mockRejectedValue(new Error("db yok")), failed: vi.fn() };
    const { deps } = makeDeps({ recorder });
    const events = await eventsOf(await handleChatRequest(post({ question: QUESTION }), deps));
    expect(events.at(-1)).toMatchObject({ type: "answer", kind: "answer" });
  });
});

describe("POST /api/sohbet: iptal", () => {
  /** İstemci kopunca (AbortSignal) iptal edildiğini gören, alt süreç bitene dek BEKLEYEN arka uç. */
  function pendingBackend() {
    let finish: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const seen: { signal?: AbortSignal; started: boolean } = { started: false };
    const createBackend = ({ signal, totalMs }: { signal: AbortSignal; totalMs: number }): LlmBackend => {
      seen.signal = signal;
      const fake = createFakeSubprocess(async () => {
        seen.started = true;
        await gate; // gerçek alt süreç: iptale rağmen kendi bitişine kadar sürer
        return { stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: goodOutput(), usage: { input_tokens: 1, output_tokens: 1 } }) };
      });
      return createClaudeCliBackend({ run: createChatRunner({ base: fake.runner, signal, totalMs }), env: {} });
    };
    return { createBackend, finish, seen };
  }

  it("istemci koptuğunda iptal sinyali verilir; yanıt yazılmaz; kilit alt süreç bitince bırakılır; kayıt 'aborted'", async () => {
    const lock = createChatLock();
    const pending = pendingBackend();
    const { deps, recorder } = makeDeps({ lock, createBackend: pending.createBackend });
    const client = new AbortController();
    const response = await handleChatRequest(post({ question: QUESTION }, {}, { signal: client.signal }), deps);
    const body = response.text();

    await vi.waitFor(() => expect(pending.seen.started).toBe(true)); // alt süreç gerçekten çalışıyor
    client.abort();
    await vi.waitFor(() => expect(pending.seen.signal?.aborted).toBe(true));

    // Süreç henüz bitmedi: kilit sürer (ikinci süreç başlatılamaz).
    expect(lock.acquire(MOCK_WORKSPACE_ID)).toBeUndefined();
    pending.finish();
    const text = await body;
    expect(text).not.toContain('"type":"answer"');
    await vi.waitFor(() => expect(recorder.failed).toHaveBeenCalledWith(MOCK_WORKSPACE_ID, "chat_aborted"));
    expect(recorder.succeeded).not.toHaveBeenCalled();
    const release = lock.acquire(MOCK_WORKSPACE_ID);
    expect(release).toBeDefined();
    release?.();
  });

  it("yanıt akışı iptal edilince (okuyucu bıraktı) de iptal sinyali verilir", async () => {
    const pending = pendingBackend();
    const { deps } = makeDeps({ createBackend: pending.createBackend });
    const response = await handleChatRequest(post({ question: QUESTION }), deps);
    await vi.waitFor(() => expect(pending.seen.started).toBe(true));
    await response.body?.cancel();
    expect(pending.seen.signal?.aborted).toBe(true);
    pending.finish();
  });
});

describe("POST /api/sohbet: iş yaptırma emri (delegate)", () => {
  const delegateOutput = () => goodOutput({ kind: "out_of_scope", text: "Bunu halkanın işlerine ileteyim.", evidence: [], command: "delegate" });

  it("işler kapalıyken (delegate undefined döner) eski davranış: salt okunur yanıt, hiçbir iş açılmaz", async () => {
    const delegate = vi.fn(async () => undefined);
    const { deps } = makeDeps({ llm: createFakeLlm(delegateOutput()).backend, delegate });
    const events = await eventsOf(await handleChatRequest(post({ question: "yeni videoları topla" }), deps));
    expect(delegate).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: "answer", kind: "out_of_scope", text: "Bunu halkanın işlerine ileteyim." });
  });

  it("delegate yoksa hiç çağrılmaz ve yanıt aynıdır", async () => {
    const { deps } = makeDeps({ llm: createFakeLlm(delegateOutput()).backend });
    const events = await eventsOf(await handleChatRequest(post({ question: "yeni videoları topla" }), deps));
    expect(events.at(-1)).toMatchObject({ type: "answer", kind: "out_of_scope" });
  });

  it("işler açıkken tek cümle sonuç metni gelir; soru metni delegate'e iletilir ve çalışma alanı bağlamdan gelir", async () => {
    const delegate = vi.fn(async () => "Başlattım: analiz. İptal: İşler ekranından.");
    const { deps } = makeDeps({ llm: createFakeLlm(delegateOutput()).backend, delegate });
    const events = await eventsOf(await handleChatRequest(post({ question: "analiz et" }), deps));
    expect(events.at(-1)).toEqual({ type: "answer", kind: "answer", text: "Başlattım: analiz. İptal: İşler ekranından.", evidence: [] });
    expect(delegate).toHaveBeenCalledWith({ workspaceId: MOCK_WORKSPACE_ID }, "analiz et");
  });

  it("delegate hata verirse sohbet çökmez, eski yanıt gelir", async () => {
    const delegate = vi.fn(async () => {
      throw new Error("patladı");
    });
    const { deps } = makeDeps({ llm: createFakeLlm(delegateOutput()).backend, delegate });
    const events = await eventsOf(await handleChatRequest(post({ question: "topla" }), deps));
    expect(events.at(-1)).toMatchObject({ type: "answer", kind: "out_of_scope" });
  });

  it("command yalnız out_of_scope ile geçerlidir", async () => {
    const delegate = vi.fn(async () => "x");
    const { deps } = makeDeps({ llm: createFakeLlm(goodOutput({ command: "delegate" }), goodOutput({ command: "delegate" })).backend, delegate });
    const events = await eventsOf(await handleChatRequest(post({ question: "topla" }), deps));
    expect(delegate).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("error");
  });
});

describe("POST /api/sohbet: fikir kaydı (save_idea)", () => {
  const saveOutput = (idea: unknown = { title: "Mutfak turu", note: "Evimin mutfağını gezdireceğim." }) =>
    goodOutput({ kind: "out_of_scope", text: "Fikrini not alıyorum.", evidence: [], command: "save_idea", idea: idea as never });

  it("fikir depoya elle fikir olarak yazılır; yanıta kayıt cümlesi eklenir; çalışma alanı bağlamdan gelir", async () => {
    const ctx = factsContext();
    const { deps } = makeDeps({ llm: createFakeLlm(saveOutput()).backend, getContext: async () => ctx });
    const events = await eventsOf(await handleChatRequest(post({ question: "şöyle bir video fikrim var: mutfak turu" }), deps));
    const answer = events.at(-1);
    expect(answer).toMatchObject({ type: "answer", kind: "out_of_scope" });
    expect((answer as { text: string }).text).toBe(`Fikrini not alıyorum. ${chatIdeaSavedText("Mutfak turu")}`);
    const saved = (await ctx.repo.listIdeas(ctx.workspaceId, { status: "new" })).filter((idea) => idea.source === "manual");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: "Mutfak turu", rationale: "Evimin mutfağını gezdireceğim.", format: "short_video", evidence: [], hooks: [] });
  });

  it("kayıt hatasında (günlük sınır dışı) yanıt kalır, kayıt cümlesi yerine 'kaydedemedim' gelir", async () => {
    const ctx = factsContext();
    vi.spyOn(ctx.repo, "createManualIdea").mockRejectedValueOnce(new Error("db yok"));
    const { deps } = makeDeps({ llm: createFakeLlm(saveOutput()).backend, getContext: async () => ctx });
    const events = await eventsOf(await handleChatRequest(post({ question: "fikrim var" }), deps));
    expect(events.at(-1)).toMatchObject({ type: "answer", text: `Fikrini not alıyorum. ${CHAT_IDEA_NOT_SAVED_TEXT}` });
  });

  it("sunucu fikri yeniden doğrular: bozuk idea kaydedilmez", async () => {
    const ctx = factsContext();
    const spy = vi.spyOn(ctx.repo, "createManualIdea");
    const { deps } = makeDeps({ llm: createFakeLlm(saveOutput({ title: "x", note: "y", extra: 1 })).backend, getContext: async () => ctx });
    const events = await eventsOf(await handleChatRequest(post({ question: "fikrim var" }), deps));
    expect(events.at(-1)?.type).toBe("error"); // şema katı: bilinmeyen alan modele düzeltme turu, sonra hata
    expect(spy).not.toHaveBeenCalled();
  });

  it("delegate davranışı değişmez: save_idea olmayan yanıtta depo yazımı yok", async () => {
    const ctx = factsContext();
    const spy = vi.spyOn(ctx.repo, "createManualIdea");
    const { deps } = makeDeps({ getContext: async () => ctx });
    await eventsOf(await handleChatRequest(post({ question: QUESTION }), deps));
    expect(spy).not.toHaveBeenCalled();
  });
});
