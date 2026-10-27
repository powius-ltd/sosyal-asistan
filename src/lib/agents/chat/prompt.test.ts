import { describe, expect, it } from "vitest";

import { buildChatSystemPrompt, CHAT_PROMPT_VERSION } from "@/lib/agents/chat/prompt";
import { LIFT_TOKEN_RULE, NO_STRAY_NUMBERS_RULE, PLAIN_LANGUAGE_RULE } from "@/lib/llm/prompt-blocks";

describe("Sohbet istemi: düz dil ve sayı belirteci", () => {
  it("sürüm v7; ortak düz dil kuralı, çarpan belirteci kuralı ve belirteç dışı sayı yasağı Analist'inkiyle aynı sabitlerden gelir", () => {
    expect(CHAT_PROMPT_VERSION).toBe("chat-v7");
    for (const type of ["business", "creator", "mixed"] as const) {
      const prompt = buildChatSystemPrompt(type);
      expect(prompt).toContain(PLAIN_LANGUAGE_RULE);
      expect(prompt).toContain(LIFT_TOKEN_RULE);
      expect(prompt).toContain(NO_STRAY_NUMBERS_RULE);
    }
  });

  it("eski 'x' çarpan anlatımı ve kendi sözlük satırları kalmadı", () => {
    const prompt = buildChatSystemPrompt();
    expect(prompt).not.toContain('renders as a multiplier ("2,3x")');
    expect(prompt).not.toContain("normal izlenmenin");
    expect(prompt).not.toContain("Never use the words");
  });

  it("'son video' paketteki latest olgudan cevaplanır; yoksa dürüstçe no_data, Ayarlar'a yönlendirme yok (D3-11)", () => {
    const prompt = buildChatSystemPrompt();
    expect(prompt).toContain("contents fact with latest = true");
    expect(prompt).toContain("{ago:REF}");
    expect(prompt).toContain("{g:own_best_window}");
    expect(prompt).not.toContain("carry NO publish dates");
    expect(prompt).toContain("never tell the creator to open settings");
    expect(prompt).toContain("do not suggest where to click");
  });
});
