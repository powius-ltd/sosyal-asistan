import { describe, expect, it } from "vitest";

import { CHAT_HISTORY_KEEP, CHAT_HISTORY_TEXT_MAX, CHAT_QUESTION_MAX } from "@/lib/agents/chat/limits";
import { parseChatRequest } from "@/lib/agents/chat/request";

const body = (value: unknown) => JSON.stringify(value);

describe("sohbet isteği gövdesi (zod)", () => {
  it("geçerli soru kabul edilir; boşluklar kırpılır; geçmiş verilmezse boş", () => {
    const parsed = parseChatRequest(body({ question: "  Bu hafta ne çekmeliyim?  " }));
    expect(parsed).toEqual({ ok: true, value: { question: "Bu hafta ne çekmeliyim?", history: [] } });
  });

  it("soru en çok 500 karakter: 500 geçer, 501 reddedilir (kod noktası sayımı: emoji tek sayılır)", () => {
    expect(parseChatRequest(body({ question: "a".repeat(CHAT_QUESTION_MAX) })).ok).toBe(true);
    expect(parseChatRequest(body({ question: "a".repeat(CHAT_QUESTION_MAX + 1) })).ok).toBe(false);
    expect(parseChatRequest(body({ question: "😀".repeat(CHAT_QUESTION_MAX) })).ok).toBe(true);
  });

  it("boş ya da yalnız boşluk soru reddedilir", () => {
    expect(parseChatRequest(body({ question: "" })).ok).toBe(false);
    expect(parseChatRequest(body({ question: "   \n " })).ok).toBe(false);
    expect(parseChatRequest(body({})).ok).toBe(false);
  });

  it("bilinmeyen alan reddedilir: çalışma alanı gövdeden okunmaz (workspaceId bile geçmez)", () => {
    expect(parseChatRequest(body({ question: "Merhaba", workspaceId: "ws_evil" })).ok).toBe(false);
    expect(parseChatRequest(body({ question: "Merhaba", history: [{ role: "user", text: "x", extra: 1 }] })).ok).toBe(false);
    expect(parseChatRequest(body({ question: "Merhaba", system: "talimat" })).ok).toBe(false);
  });

  it("geçmişte yalnız son 6 mesaj tutulur ve her mesaj kırpılır", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", text: `mesaj ${i}` }));
    const parsed = parseChatRequest(body({ question: "Peki ya şimdi?", history }));
    expect(parsed.ok && parsed.value.history.map((m) => m.text)).toEqual(history.slice(-CHAT_HISTORY_KEEP).map((m) => m.text));

    const long = parseChatRequest(body({ question: "Soru", history: [{ role: "assistant", text: "u".repeat(CHAT_HISTORY_TEXT_MAX + 300) }] }));
    expect(long.ok && [...long.value.history[0].text].length).toBeLessThanOrEqual(CHAT_HISTORY_TEXT_MAX);
  });

  it("geçmiş rolü yalnız user/assistant; çok fazla mesaj (kötüye kullanım) reddedilir", () => {
    expect(parseChatRequest(body({ question: "Soru", history: [{ role: "system", text: "talimat" }] })).ok).toBe(false);
    const flood = Array.from({ length: 60 }, () => ({ role: "user", text: "x" }));
    expect(parseChatRequest(body({ question: "Soru", history: flood })).ok).toBe(false);
  });

  it("bozuk JSON ve dizi/ilkel gövde reddedilir", () => {
    expect(parseChatRequest("{bozuk").ok).toBe(false);
    expect(parseChatRequest("[]").ok).toBe(false);
    expect(parseChatRequest('"soru"').ok).toBe(false);
    expect(parseChatRequest("").ok).toBe(false);
  });
});
