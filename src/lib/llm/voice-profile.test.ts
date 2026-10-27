import { describe, expect, it } from "vitest";

import type { ContentText } from "@/lib/llm/content-text";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { analyzeVoiceOutput, buildVoiceProfile, PROMPT_VERSION } from "@/lib/llm/voice-profile";

const contents: ContentText[] = [
  { id: "own1", caption: "You are not behind, you are becoming. Save this for later.", transcript: "Listen to me, you are not behind. You are becoming the woman you prayed for. Take a breath and say this with me." },
  { id: "own2", caption: "Your nervous system knows before you do.", transcript: "Here is what nobody told you about healing. Your body keeps the score, and it also keeps the receipts of your safety." },
  { id: "own3", transcript: "Okay babe, real talk. If you keep waiting for permission, you will wait forever. So ask yourself what would love do here." },
  { id: "own4", caption: "Breathe. Soften. Begin again.", transcript: "Put your hand on your heart. Breathe in slowly. Now tell me what you need to hear today." },
  { id: "own5", transcript: "When I was thirty I thought faith meant certainty. Now I know faith is walking while the path is still dark." },
  { id: "own6", caption: "Healing is not linear.", transcript: "Healing is not linear and it is not a race. Some days you bloom and some days you rest, and both are holy." },
];

const example = (contentId: string, quote: string) => ({ contentId, quote });
const trait = (key: string, contentId: string, quote: string) => ({ key, label: `Özellik ${key}`, description: `${key} açıklaması.`, examples: [example(contentId, quote)] });

const VALID_TRAITS = [
  trait("direct-address", "own1", "Listen to me, you are not behind."),
  trait("body-wisdom", "own2", "Your body keeps the score"),
  trait("casual-opener", "own3", "Okay babe, real talk."),
  trait("guided-breath", "own4", "Put your hand on your heart."),
  trait("faith-story", "own5", "faith is walking while the path is still dark"),
  trait("gentle-reframe", "own6", "Healing is not linear and it is not a race."),
];

const output = (over: Record<string, unknown> = {}) => ({
  summary: "Sıcak, doğrudan ve şefkatli; izleyiciye tek tek konuşur.",
  traits: VALID_TRAITS,
  lexicon: { signaturePhrases: ["real talk", "Healing is not linear", "manifest your abundance"], avoidPhrases: ["leverage your synergy"] },
  ...over,
});

const input = { ownerHandle: "ornek", language: "en", contents };

describe("buildVoiceProfile: doğrulama", () => {
  it("tüm alıntılar kendi içeriğinin korpusunda → 6 doğrulanmış özellik, profil kullanılabilir", async () => {
    const llm = createFakeLlm(output());
    const draft = await buildVoiceProfile(llm.backend, input);

    expect(draft.traits).toHaveLength(6);
    expect(draft.traits.every((t) => t.verified)).toBe(true);
    expect(draft.verifiedTraitCount).toBe(6);
    expect(draft.usable).toBe(true);
    expect(draft.traits[0].examples).toEqual([{ contentItemId: "own1", quote: "Listen to me, you are not behind." }]);
    expect(draft.lexicon).toEqual({ signaturePhrases: ["real talk", "Healing is not linear"], avoidPhrases: ["leverage your synergy"] });
    expect(draft.notes.some((n) => n.includes("manifest your abundance"))).toBe(true); // korpusta yok → atıldı
    expect(draft).toMatchObject({ sampleSize: 6, language: "en", promptVersion: PROMPT_VERSION });
    expect(draft.meta).toMatchObject({ kind: "llm_voice_profile", attempts: 1 });
  });

  it("uydurma alıntı: örnek atılır, özellik doğrulanmamış; düzeltme turu sorunu modele gösterir", async () => {
    const fabricated = [...VALID_TRAITS.slice(0, 5), trait("gentle-reframe", "own6", "Healing is a sacred spiral of light")];
    const llm = createFakeLlm(output({ traits: fabricated }), output());
    const draft = await buildVoiceProfile(llm.backend, input);

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].input).toContain("Healing is a sacred spiral of light");
    expect(llm.calls[1].input).toContain("birebir bulunamadı");
    expect(draft.meta.attempts).toBe(2);
    expect(draft.usable).toBe(true); // düzeltilmiş yanıt geçerli
  });

  it("düzeltmeden sonra da uydurma varsa kabul edilir AMA işaretli: özellik verified=false, alıntısı atılmış, notlarda", async () => {
    const fabricated = [...VALID_TRAITS.slice(0, 5), trait("gentle-reframe", "own6", "Healing is a sacred spiral of light")];
    const llm = createFakeLlm(output({ traits: fabricated }));
    const draft = await buildVoiceProfile(llm.backend, input);

    const bad = draft.traits.find((t) => t.key === "gentle-reframe");
    expect(bad).toMatchObject({ verified: false, examples: [] });
    expect(draft.verifiedTraitCount).toBe(5);
    expect(draft.usable).toBe(true); // tam 5 doğrulanmış: eşik dahil
    expect(draft.notes.join("\n")).toContain("Healing is a sacred spiral of light");
  });

  it("alıntı doğru metinden ama YANLIŞ içerik id'siyle → doğrulanmaz (kaynak içerik id'si denetlenir)", () => {
    const analyzed = analyzeVoiceOutput(output({ traits: [trait("body-wisdom", "own1", "Your body keeps the score")] }) as never, contents);
    expect(analyzed.traits[0]).toMatchObject({ verified: false, examples: [] });
    const unknownId = analyzeVoiceOutput(output({ traits: [trait("x-trait", "nope", "Your body keeps the score")] }) as never, contents);
    expect(unknownId.quoteProblems[0]).toContain("girdide yok");
  });

  it("çok kısa (1 kelime) alıntı kanıt sayılmaz", () => {
    const analyzed = analyzeVoiceOutput(output({ traits: [trait("one-word", "own1", "Listen")] }) as never, contents);
    expect(analyzed.traits[0].verified).toBe(false);
    expect(analyzed.quoteProblems[0]).toContain("en az 2 kelime");
  });

  it("açıklama ya da transcript kanalından gelen alıntı kabul; büyük/küçük harf farkı normalleştirilir", () => {
    const analyzed = analyzeVoiceOutput(
      output({ traits: [trait("caption-quote", "own1", "you are not behind, you are becoming"), trait("curly", "own3", "OKAY BABE, REAL TALK")] }) as never,
      contents,
    );
    expect(analyzed.traits.map((t) => t.verified)).toEqual([true, true]);
  });

  it("<5 doğrulanmış özellik → usable=false", async () => {
    const llm = createFakeLlm(output({ traits: VALID_TRAITS.slice(0, 4) }));
    const draft = await buildVoiceProfile(llm.backend, input);
    expect(draft.verifiedTraitCount).toBe(4);
    expect(draft.usable).toBe(false);
    expect(llm.calls).toHaveLength(2); // yetersiz sayı da düzeltme turunu tetikler
  });

  it("yinelenen özellik anahtarı: ilki tutulur, not düşer; kendi metninde geçen 'kaçınılacak' ifade atılır", async () => {
    const llm = createFakeLlm(output({ traits: [...VALID_TRAITS, trait("direct-address", "own1", "Take a breath and say this")], lexicon: { signaturePhrases: [], avoidPhrases: ["Breathe", "corporate jargon"] } }));
    const draft = await buildVoiceProfile(llm.backend, input);
    expect(draft.traits.filter((t) => t.key === "direct-address")).toHaveLength(1);
    expect(draft.lexicon.avoidPhrases).toEqual(["corporate jargon"]);
    expect(draft.notes.join("\n")).toContain("Kaçınılacak ifade atıldı");
  });
});

describe("buildVoiceProfile: girdi ve prompt", () => {
  it("metinli içerik yoksa çağrı yapılmaz", async () => {
    const llm = createFakeLlm(output());
    await expect(buildVoiceProfile(llm.backend, { ownerHandle: "ornek", contents: [{ id: "x" }, { id: "y", caption: " " }] })).rejects.toMatchObject({ code: "invalid_input" });
    expect(llm.calls).toHaveLength(0);
  });

  it("içerikler etiketli veri bloğunda, talimat sistem isteminde; metinsiz içerik gönderilmez", async () => {
    const llm = createFakeLlm(output());
    await buildVoiceProfile(llm.backend, { ownerHandle: "ornek", contents: [...contents, { id: "empty" }] });
    const stdin = llm.calls[0].input as string;
    expect(stdin).toContain("<posts>");
    expect(stdin).toContain('"id":"own1"');
    expect(stdin).not.toContain('"id":"empty"');
    expect(llm.calls[0].args?.join(" ")).toContain("verbatim");
  });
});
