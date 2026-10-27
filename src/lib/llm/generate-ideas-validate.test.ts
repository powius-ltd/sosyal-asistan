import { describe, expect, it } from "vitest";

import { directions, evidenceList, rawIdea, SCRIPT, voice } from "@/lib/llm/generate-ideas-fixtures";
import { indexById } from "@/lib/llm/content-text";
import { COPY_WORD_LIMIT, PERSONAL_CLAIM_NOTE, validateIdea, type IdeaValidationContext } from "@/lib/llm/generate-ideas-validate";

const context = (over: { r1Lift?: number; r2Lift?: number } = {}, language: IdeaValidationContext["language"] = "en"): IdeaValidationContext => ({
  language,
  evidence: indexById(evidenceList(over)),
  directions,
  verifiedTraitKeys: new Set(voice().traits.filter((t) => t.verified).map((t) => t.key)),
});

const reasonsOf = (verdict: ReturnType<typeof validateIdea>): string => (verdict.ok ? "" : verdict.dropped.reasons.join(" | "));

describe("validateIdea: geçerli fikir", () => {
  it("IdeaDetails'e eşlenir: hook türleri hook'larla aynı sırada, süre kovası, ownTried yönden, kanıt lift'i", () => {
    const verdict = validateIdea(rawIdea(), context());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const { idea } = verdict;

    expect(idea.hooks).toHaveLength(3);
    expect(idea.hookType).toBe("bold_claim");
    expect(idea.details).toMatchObject({
      topic: "Sabah rutini",
      frame: "personal",
      ctaType: "comment_keyword",
      targetDurationSec: 75,
      durationBucket: "60_90",
      script: SCRIPT,
      scriptLanguage: "en",
      hookTypes: ["bold_claim", "question", "confession"],
      voiceTraitKeys: ["direct-address"],
      ownTried: false,
      quotes: [{ contentItemId: "r1", ownerHandle: "noelle", text: "Comment FUTURE SELF and I will send you the ritual" }],
    });
    expect(idea.details.maxSharedWords).toBeLessThan(COPY_WORD_LIMIT);
    expect(idea.evidence).toEqual([{ contentItemId: "r1", liftAtCreation: 4.2 }, { contentItemId: "o1", liftAtCreation: 1.8 }]);
    expect(idea.directionRef).toBe("F1");
    expect(idea.relaxedOutlier).toBe(false);
    expect(idea.scriptOutline).toHaveLength(3);
  });
});

describe("validateIdea: kanıt kuralları", () => {
  it("girdide olmayan kanıt id'si düşürür", () => {
    expect(reasonsOf(validateIdea(rawIdea({ evidenceIds: ["r1", "uydurma"] }), context()))).toContain("girdide olmayan kanıt id'si: uydurma");
  });

  it("≥ 2 FARKLI kanıt: tekrarlanan id iki sayılmaz", () => {
    expect(reasonsOf(validateIdea(rawIdea({ evidenceIds: ["r1", "r1"] }), context()))).toContain("en az 2 farklı");
  });

  it("rakip tutanı yoksa düşer: yalnız kendi içerik + zayıf rakip; havuzda ≥3x varken 2.4x'le yetinmek geçersiz", () => {
    expect(reasonsOf(validateIdea(rawIdea({ evidenceIds: ["o1", "r3"] }), context()))).toContain("rakip tutanı");
    const weakPick = validateIdea(rawIdea({ evidenceIds: ["r2", "o1"] }), context());
    expect(weakPick.ok).toBe(false);
    expect(reasonsOf(weakPick)).toContain("havuzda var");
  });

  it("havuzda ≥ 3x rakip HİÇ yoksa ≥ 2x kabul edilir ve işaretlenir; ≥ 2x da yoksa düşer", () => {
    const relaxed = validateIdea(rawIdea({ evidenceIds: ["r2", "o1"], quotes: [{ contentId: "r2", text: "start asking yourself what you already know" }] }), context({ r1Lift: 1.4 }));
    expect(relaxed.ok && relaxed.idea.relaxedOutlier).toBe(true);

    const none = validateIdea(rawIdea({ evidenceIds: ["r2", "o1"], quotes: [{ contentId: "r2", text: "start asking yourself what you already know" }] }), context({ r1Lift: 1.4, r2Lift: 1.9 }));
    expect(none.ok).toBe(false);
    expect(reasonsOf(none)).toContain("havuzda da yok");
  });

  it("lift'i ölçülemeyen (undefined) rakip tutan sayılmaz (undefined ≠ büyük)", () => {
    const ctx = context();
    ctx.evidence.get("r1")!.lift = undefined;
    expect(validateIdea(rawIdea({ evidenceIds: ["r1", "o1"] }), ctx).ok).toBe(false);
  });
});

describe("validateIdea: alıntılar", () => {
  it("korpusta olmayan alıntı atılır; geçerli alıntı kalırsa fikir yaşar (not düşer)", () => {
    const verdict = validateIdea(rawIdea({ quotes: [{ contentId: "r1", text: "Comment FUTURE SELF and I will send you the ritual" }, { contentId: "r1", text: "Comment DREAM LIFE and receive a miracle" }] }), context());
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.idea.details.quotes).toHaveLength(1);
      expect(verdict.idea.notes.join(" ")).toContain("Alıntı atıldı");
    }
  });

  it("hiç doğrulanmış alıntı kalmazsa fikir düşer", () => {
    expect(reasonsOf(validateIdea(rawIdea({ quotes: [{ contentId: "r1", text: "Comment DREAM LIFE and receive a miracle" }] }), context()))).toContain("doğrulanmış rakip alıntısı yok");
  });

  it("alıntı kendi içeriğinden ya da fikrin kanıt listesinde olmayan içerikten olamaz (rakip + kanıt şartı)", () => {
    expect(reasonsOf(validateIdea(rawIdea({ quotes: [{ contentId: "o1", text: "You are allowed to begin again" }] }), context()))).toContain("doğrulanmış rakip alıntısı yok");
    expect(reasonsOf(validateIdea(rawIdea({ quotes: [{ contentId: "r3", text: "Nobody talks about the ninety second rule" }] }), context()))).toContain("doğrulanmış rakip alıntısı yok");
  });

  it("alıntı başka içeriğe atfedilirse (r1'in cümlesi r2'ye) doğrulanmaz", () => {
    const ctx = context();
    expect(reasonsOf(validateIdea(rawIdea({ evidenceIds: ["r1", "r2"], quotes: [{ contentId: "r2", text: "Comment FUTURE SELF and I will send you the ritual" }] }), ctx))).toContain("doğrulanmış rakip alıntısı yok");
  });
});

describe("validateIdea: kişisel anlatım (kendi korpusunda doğrulanan dayanak + onay notu)", () => {
  const ownQuote = { contentId: "o1", text: "You are allowed to begin again" };

  it("kişisel anlatım yoksa not da alıntı da yok; gerekçe aynen kalır", () => {
    const verdict = validateIdea(rawIdea(), context());
    expect(verdict.ok && verdict.idea.rationale.includes(PERSONAL_CLAIM_NOTE)).toBe(false);
    expect(verdict.ok && verdict.idea.details.personalQuotes).toBeFalsy();
  });

  it("kendi videosundan doğrulanan alıntı: details'e yazılır, gerekçeye onay notu eklenir", () => {
    const verdict = validateIdea(rawIdea({ usesPersonalStory: true, personalQuotes: [ownQuote] }), context());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.idea.details.personalQuotes).toEqual([{ contentItemId: "o1", ownerHandle: "ornek", text: ownQuote.text }]);
    expect(verdict.idea.rationale.endsWith("Yayından önce hesap sahibi onaylamalı: kişisel anlatım.")).toBe(true);
    expect(verdict.idea.notes).toContain(PERSONAL_CLAIM_NOTE);
  });

  it("kişisel anlatım var ama alıntı yok, korpusta yok, rakip içerikten ya da kanıt listesinde olmayan kendi içerikten: fikir düşer", () => {
    const reason = "kişisel anlatım var";
    expect(reasonsOf(validateIdea(rawIdea({ usesPersonalStory: true }), context()))).toContain(reason);
    expect(reasonsOf(validateIdea(rawIdea({ usesPersonalStory: true, personalQuotes: [{ contentId: "o1", text: "I moved to San Francisco in 2019" }] }), context()))).toContain(reason);
    expect(reasonsOf(validateIdea(rawIdea({ usesPersonalStory: true, personalQuotes: [{ contentId: "r1", text: "Comment FUTURE SELF and I will send you the ritual" }] }), context()))).toContain(reason);
    expect(reasonsOf(validateIdea(rawIdea({ evidenceIds: ["r1", "r2"], usesPersonalStory: true, personalQuotes: [ownQuote] }), context()))).toContain(reason);
  });

  it("bayrak yok ama kişisel alıntı verilmişse de kişisel sayılır (alıntı doğrulanır, not eklenir)", () => {
    const verdict = validateIdea(rawIdea({ personalQuotes: [ownQuote] }), context());
    expect(verdict.ok && verdict.idea.details.personalQuotes).toHaveLength(1);
  });
});

describe("validateIdea: KOPYA ENGELİ (script ↔ rakip transcript, < 8 kelime)", () => {
  const withScript = (sentence: string) => rawIdea({ script: `${SCRIPT} ${sentence}` });

  it("8 ardışık kelime rakip transcript'iyle paylaşılırsa düşer", () => {
    const verdict = validateIdea(withScript("So remember: will send you the ritual I use every."), context());
    expect(verdict.ok).toBe(false);
    expect(reasonsOf(verdict)).toContain("kopya: r1");
    expect(reasonsOf(verdict)).toContain("8 kelimelik");
  });

  it("7 ardışık kelime serbest (sınır tam 8)", () => {
    const verdict = validateIdea(withScript("So remember: will send you the ritual I use."), context());
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.idea.details.maxSharedWords).toBe(7);
  });

  it("noktalama/büyük-küçük harf farkı kopyayı gizlemez", () => {
    expect(validateIdea(withScript("WILL, SEND you... the ritual; I use every single!"), context()).ok).toBe(false);
  });

  it("fikrin KANIT listesinde olmayan herhangi bir rakip transcript'inden kopya da düşürür (r3)", () => {
    const verdict = validateIdea(withScript("Nobody talks about the ninety second rule for anger, and it quietly changes."), context());
    expect(reasonsOf(verdict)).toContain("kopya: r3");
  });

  it("hook ya da açıklama taslağı da aynı denetimden geçer", () => {
    const hooks = [{ text: "Stop asking for signs and start asking yourself what you already know in your bones", type: "callout" as const }, ...rawIdea().hooks.slice(1)];
    expect(reasonsOf(validateIdea(rawIdea({ hooks }), context()))).toContain("kopya: r2");
    expect(reasonsOf(validateIdea(rawIdea({ captionDraft: "Listen, if you keep scrolling past this, you are choosing to stay stuck. #x" }), context()))).toContain("kopya: r1");
  });

  it("kendi (Ornek) içeriğiyle benzerlik kopya sayılmaz", () => {
    expect(validateIdea(withScript("Take a breath. You are allowed to begin again, even today, even now."), context()).ok).toBe(true);
  });
});

describe("validateIdea: dil, biçim, ses", () => {
  it("İngilizce alanlarda Türkçe harf, kısa script, yinelenen hook ve aşırı uzun açıklama düşürür", () => {
    expect(reasonsOf(validateIdea(rawIdea({ script: `${SCRIPT} Şimdi başlayalım.` }), context()))).toContain("İngilizce olmalı");
    expect(reasonsOf(validateIdea(rawIdea({ script: "Just breathe and begin again now please." }), context()))).toContain("script çok kısa");
    const dup = rawIdea().hooks;
    expect(reasonsOf(validateIdea(rawIdea({ hooks: [dup[0], { ...dup[0], text: dup[0].text.toUpperCase() }, dup[2]] }), context()))).toContain("hook'lar birbirinin aynısı");
    expect(reasonsOf(validateIdea(rawIdea({ captionDraft: Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ") }), context()))).toContain("hashtag");
  });

  it("hook sayısı 3–5 dışındaysa doğrulayıcı da düşürür (şemadan bağımsız)", () => {
    const hooks = rawIdea().hooks;
    expect(reasonsOf(validateIdea(rawIdea({ hooks: hooks.slice(0, 2) }), context()))).toContain("hook sayısı 3–5");
    const six = [...hooks, { text: "One more angle on mornings.", type: "list" as const }, { text: "And another angle entirely.", type: "pov" as const }, { text: "A sixth unrelated opening line.", type: "callout" as const }];
    expect(reasonsOf(validateIdea(rawIdea({ hooks: six }), context()))).toContain("hook sayısı 3–5");
  });

  it("birden çok sebep birlikte raporlanır (sessiz kabul yok)", () => {
    const verdict = validateIdea(rawIdea({ evidenceIds: ["r1"], quotes: [{ contentId: "r1", text: "nope nope nope" }], script: "kısa şey" }), context());
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.dropped.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("doğrulanmamış ses özelliği anahtarı ve bilinmeyen yön ref'i kırpılır (fikir düşmez)", () => {
    const verdict = validateIdea(rawIdea({ voiceTraitKeys: ["direct-address", "uydurma-ozellik"], directionRef: "F9" }), context());
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.idea.details.voiceTraitKeys).toEqual(["direct-address"]);
      expect(verdict.idea.directionRef).toBeUndefined();
      expect(verdict.idea.details.ownTried).toBeUndefined();
      expect(verdict.idea.notes.join(" ")).toContain("ses özelliği");
    }
  });
});
