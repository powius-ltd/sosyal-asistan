import { describe, expect, it } from "vitest";

import { emptyLexicon, isVoiceProfileUsable, VOICE_MIN_VERIFIED_TRAITS, verifiedTraits, type VoiceTrait } from "@/lib/domain/voice-profile";

const trait = (key: string, verified: boolean): VoiceTrait => ({ key, label: key, description: "", verified, examples: [] });

describe("ses profili", () => {
  it("verifiedTraits yalnız doğrulanmış özellikleri döndürür", () => {
    const traits = [trait("a", true), trait("b", false), trait("c", true)];
    expect(verifiedTraits({ traits }).map((t) => t.key)).toEqual(["a", "c"]);
  });

  it("≥ 5 doğrulanmış özellik = kullanılabilir; doğrulanmamışlar sayılmaz", () => {
    const five = Array.from({ length: VOICE_MIN_VERIFIED_TRAITS }, (_, i) => trait(`t${i}`, true));
    expect(isVoiceProfileUsable({ traits: five })).toBe(true);
    expect(isVoiceProfileUsable({ traits: [...five.slice(1), trait("x", false)] })).toBe(false);
    expect(isVoiceProfileUsable(null)).toBe(false);
    expect(isVoiceProfileUsable(undefined)).toBe(false);
  });

  it("emptyLexicon her çağrıda bağımsız dizi verir", () => {
    const a = emptyLexicon();
    a.avoidPhrases.push("x");
    expect(emptyLexicon()).toEqual({ signaturePhrases: [], avoidPhrases: [] });
  });
});
