import { describe, expect, it } from "vitest";

import { DEFAULT_MASKOT_NAME, MASKOT_NAME_MAX_CHARS, PERSONA_TONE_RULES, PERSONA_VERSION, maskotName, personaPrompt } from "@/lib/agents/persona";

describe("maskotName", () => {
  it("env yoksa ya da boşsa varsayılan ad", () => {
    expect(maskotName({})).toBe(DEFAULT_MASKOT_NAME);
    expect(maskotName({ MASKOT_ADI: "" })).toBe("Demirkazık");
    expect(maskotName({ MASKOT_ADI: "   " })).toBe("Demirkazık");
  });

  it("env adı kullanılır; boşluk kırpılır, satır sonu/denetim karakteri atılır", () => {
    expect(maskotName({ MASKOT_ADI: "  Pusula  " })).toBe("Pusula");
    expect(maskotName({ MASKOT_ADI: "Pu\nsula\t\tAI" })).toBe("Pu sula AI");
    expect(maskotName({ MASKOT_ADI: "\u0000\u001f" })).toBe("Demirkazık");
  });

  it("uzun ad kod noktası bazında kesilir (Türkçe karakter bozulmaz)", () => {
    const long = "ğ".repeat(MASKOT_NAME_MAX_CHARS + 10);
    expect([...maskotName({ MASKOT_ADI: long })]).toHaveLength(MASKOT_NAME_MAX_CHARS);
  });
});

describe("persona", () => {
  it("sürüm dolu; istem ton kurallarını içerir ve adı GÖMMEZ", () => {
    expect(PERSONA_VERSION).toMatch(/^persona-v\d+$/);
    const prompt = personaPrompt();
    for (const rule of PERSONA_TONE_RULES) expect(prompt).toContain(rule);
    expect(prompt).not.toContain(DEFAULT_MASKOT_NAME);
    expect(PERSONA_TONE_RULES.some((r) => r.includes('"sen"'))).toBe(true);
  });
});
