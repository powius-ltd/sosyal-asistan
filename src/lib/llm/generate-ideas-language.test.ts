import { describe, expect, it } from "vitest";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { indexById } from "@/lib/llm/content-text";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { generateIdeas, type GenerateIdeasInput } from "@/lib/llm/generate-ideas";
import { directions, evidenceList, rawIdea, voice } from "@/lib/llm/generate-ideas-fixtures";
import { validateIdea, WRONG_LANGUAGE_MIN_WORDS, type IdeaValidationContext } from "@/lib/llm/generate-ideas-validate";

const TR_SCRIPT =
  "Sabahları telefonuna uzanmadan önce elini göğsüne koy ve kendine dürüst bir soru sor: bugüne ne taşıyorum? Çoğumuz cevabı duyacak kadar durmuyoruz. Yarın dene ve bana ne çıktığını yaz.";
const TR_HOOKS = [
  { text: "Sabahların hakkında kimse sana bunu söylemedi.", type: "bold_claim" as const },
  { text: "İlk beş dakikan bütün gününü belirlese ne olurdu?", type: "question" as const },
  { text: "Bunu atlıyordum ve bana aylara mal oldu.", type: "confession" as const },
];
const trIdea = (over: Parameters<typeof rawIdea>[0] = {}) => rawIdea({ hooks: TR_HOOKS, script: TR_SCRIPT, captionDraft: "Sabahların sessiz bir dua gibi. #sabah", ...over });

const input = (over: Partial<GenerateIdeasInput> = {}): GenerateIdeasInput => ({
  ownerHandle: "hesap",
  language: "en",
  directions,
  evidence: evidenceList(),
  voice: voice(),
  ...over,
});
const ideas = (n: number, over: Parameters<typeof rawIdea>[0] = {}) => Array.from({ length: n }, (_, i) => rawIdea({ title: `Fikir ${i + 1}`, ...over }));

const context = (language: ContentLanguage): IdeaValidationContext => ({
  language,
  evidence: indexById(evidenceList()),
  directions,
  verifiedTraitKeys: new Set(voice().traits.filter((t) => t.verified).map((t) => t.key)),
});
const reasonsOf = (verdict: ReturnType<typeof validateIdea>): string => (verdict.ok ? "" : verdict.dropped.reasons.join(" | "));
const notesOf = (verdict: ReturnType<typeof validateIdea>): string => (verdict.ok ? verdict.idea.notes.join(" ") : "");

describe("validateIdea: içerik diline göre doğrulama", () => {
  it("tr: Türkçe harfli hook/script/açıklama düşmez (İngilizce kuralı yalnız en'de) ve scriptLanguage tr olur", () => {
    const verdict = validateIdea(trIdea(), context("tr"));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.idea.details.scriptLanguage).toBe("tr");
    expect(notesOf(verdict)).not.toContain("Türkçe görünmüyor");
  });

  it("en: aynı Türkçe fikir düşer (kural dile bağlıdır)", () => {
    expect(reasonsOf(validateIdea(trIdea(), context("en")))).toContain("İngilizce olmalı");
  });

  it("tr: uzun script'te hiç Türkçe'ye özgü harf yoksa fikir DÜŞMEZ, nota yanlış dil uyarısı yazılır", () => {
    const verdict = validateIdea(rawIdea(), context("tr")); // fikstür İngilizce, ≥ 25 kelime
    expect(verdict.ok).toBe(true);
    expect(notesOf(verdict)).toMatch(/Script Türkçe görünmüyor \(\d+ kelimede/);
  });

  it(`tr: kısa script (< ${WRONG_LANGUAGE_MIN_WORDS} kelime) harfsiz olsa da uyarı üretmez`, () => {
    const short = "Take a breath now and ask yourself one honest question about this very morning, then write it down for me.";
    const verdict = validateIdea(rawIdea({ script: short }), context("tr"));
    expect(verdict.ok).toBe(true);
    expect(notesOf(verdict)).not.toContain("Türkçe görünmüyor");
  });

  it("en: yanlış dil uyarısı yok (kaba kontrol yalnız tr için)", () => {
    const verdict = validateIdea(rawIdea(), context("en"));
    expect(verdict.ok).toBe(true);
    expect(notesOf(verdict)).not.toContain("Türkçe görünmüyor");
  });
});

describe("generateIdeas: içerik dili", () => {
  it("tr: sistem istemi Türkçe içerik ister, şema açıklamaları Türkçe, creator bloğu dili taşır; gömülü hesap adı yok", async () => {
    const llm = createFakeLlm({ ideas: ideas(6, { hooks: TR_HOOKS, script: TR_SCRIPT, captionDraft: "Sabahların sessiz bir dua gibi. #sabah" }) });
    const out = await generateIdeas(llm.backend, input({ language: "tr", audienceRegion: "TR" }));

    const args = llm.calls[0].args?.join("\n") ?? "";
    expect(args).toContain("natural, conversational Turkish as spoken in Turkey");
    expect(args).not.toContain("Never put Turkish in it");
    expect(args).toContain("Turkish opening line");
    expect(args).toContain("Full spoken script in Turkish");
    expect(args).not.toContain("English opening line");
    expect(args).not.toContain("Ornek");
    const stdin = llm.calls[0].input as string;
    expect(stdin).toContain('"contentLanguage":"tr"');
    expect(stdin).toContain('"audienceRegion":"TR"');
    expect(out.ideas).toHaveLength(6);
    expect(out.ideas[0].details.scriptLanguage).toBe("tr");
  });

  it("en: creator bloğu dili ve bölgeyi taşır, şema açıklamaları İngilizce", async () => {
    const llm = createFakeLlm({ ideas: ideas(5) });
    await generateIdeas(llm.backend, input({ language: "en", audienceRegion: "US" }));
    const stdin = llm.calls[0].input as string;
    expect(stdin).toContain('"contentLanguage":"en"');
    expect(stdin).toContain('"audienceRegion":"US"');
    expect(llm.calls[0].args?.join("\n")).toContain("English opening line");
  });

  it("audienceRegion yoksa creator bloğunda anahtar da yok (gömülü kitle varsayımı yok)", async () => {
    const llm = createFakeLlm({ ideas: ideas(5) });
    await generateIdeas(llm.backend, input({ language: "en" }));
    const stdin = llm.calls[0].input as string;
    expect(stdin).not.toContain("audienceRegion");
    expect(stdin).not.toContain('"audience"');
  });
});
