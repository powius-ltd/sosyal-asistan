import { describe, expect, it } from "vitest";

import { encodeChatEvent, parseChatEvent, type ChatEvent } from "@/lib/agents/chat/events";

describe("sohbet olayları (NDJSON)", () => {
  it("her olay tek satırdır ve gidiş-dönüşte aynı kalır", () => {
    const events: ChatEvent[] = [
      { type: "stage", stage: "facts" },
      { type: "answer", kind: "answer", text: "Metin\nikinci satır", confidence: "medium", evidence: ["c:ci_1", "plan:2026-09-28"] },
      { type: "answer", kind: "no_data", text: "Veri yok.", evidence: [] },
      { type: "error", code: "busy", message: "Meşgul." },
    ];
    for (const event of events) {
      const line = encodeChatEvent(event);
      expect(line.endsWith("\n")).toBe(true);
      expect(line.trimEnd()).not.toContain("\n"); // metindeki satır sonu kaçırılır
      expect(parseChatEvent(line)).toEqual(event);
    }
  });

  it("boş, bozuk ve tanınmayan satırlar yok sayılır", () => {
    for (const line of ["", "  ", "{bozuk", "[]", '"x"', '{"type":"bilinmeyen"}', '{"type":"stage","stage":"x"}', '{"type":"error","code":"uydurma","message":"m"}', '{"type":"answer","kind":"answer"}']) {
      expect(parseChatEvent(line), line).toBeUndefined();
    }
  });

  it("geçersiz kanıt ref'leri ve bilinmeyen güven düzeyi süzülür", () => {
    const parsed = parseChatEvent('{"type":"answer","kind":"answer","text":"x","confidence":"kesin","evidence":["c:ci_1","javascript:alert(1)",5,"c:a:b"]}');
    expect(parsed).toEqual({ type: "answer", kind: "answer", text: "x", evidence: ["c:ci_1"] });
  });
});
