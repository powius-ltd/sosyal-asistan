import { describe, expect, it } from "vitest";

import { ANALYST_PROMPT_VERSION, buildAnalystSystemPrompt } from "@/lib/agents/analyst/prompt";
import { LIFT_TOKEN_RULE, NO_STRAY_NUMBERS_RULE, PLAIN_LANGUAGE_RULE } from "@/lib/llm/prompt-blocks";

describe("Analist istemi: düz dil ve sayı belirteci", () => {
  it("sürüm v5; her hesap türünde ortak düz dil kuralı, çarpan belirteci kuralı ve belirteç dışı sayı yasağı var", () => {
    expect(ANALYST_PROMPT_VERSION).toBe("analyst-v5");
    for (const type of ["business", "creator", "mixed"] as const) {
      const prompt = buildAnalystSystemPrompt(type);
      expect(prompt).toContain(PLAIN_LANGUAGE_RULE);
      expect(prompt).toContain(LIFT_TOKEN_RULE);
      expect(prompt).toContain(NO_STRAY_NUMBERS_RULE);
    }
  });

  it("eski 'x' çarpan anlatımı kalmadı: belirteç '2,3 katı' diye yerleşir", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).not.toContain('renders as a multiplier ("2,3x")');
    expect(prompt).not.toContain("normal izlenmenin");
  });

  it("yayın tarihi olgudur: tarih yalnız belirteçle yazılır, 'en iyi video' iddiası pencere söyler, 'son video' latest işaretinden gelir", () => {
    const prompt = buildAnalystSystemPrompt();
    expect(prompt).toContain("{ago:REF}");
    expect(prompt).toContain("{g:own_best_window}");
    expect(prompt).toContain("latest = true");
    expect(prompt).toContain("never call a video the best with no time frame");
  });
});
