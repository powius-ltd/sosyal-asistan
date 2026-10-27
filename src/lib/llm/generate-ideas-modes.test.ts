/**
 * `generate-ideas`: plan modu (rakipsiz: ≥ 1 KENDİ tutanı) ve hesap türü (amaç + CTA uyumu + fikir amacı) testleri. Rakip modunun kuralları
 * `generate-ideas-validate.test.ts`'te; burada yalnız modun/türün FARK yarattığı yerler.
 */
import { describe, expect, it } from "vitest";

import { CTA_TYPE_LABEL } from "@/lib/domain/taxonomy";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { generateIdeas, type GenerateIdeasInput } from "@/lib/llm/generate-ideas";
import { directions, rawIdea, voice } from "@/lib/llm/generate-ideas-fixtures";
import { ctaMismatchNote, validateIdea, type IdeaEvidenceContent, type IdeaValidationContext } from "@/lib/llm/generate-ideas-validate";
import { indexById } from "@/lib/llm/content-text";

const OWN_WIN = "Honestly, the quiet ninety second rule changed how I answer anger, and I want to share exactly how it works for me today.";
const OWN_NEIGHBOUR = "Take a breath. You are allowed to begin again, even today, even now.";

/** Rakipsiz havuz: kendi tutan (o1, 4,1x), daha zayıf kendi video (o2, 1,8x), kendi videosu 1,6x (o3) ve ölçülemeyen (o4). */
const ownEvidence = (over: { o1Lift?: number; o2Lift?: number } = {}): IdeaEvidenceContent[] => [
  { id: "o1", ownerHandle: "ornekmarka", isOwn: true, lift: over.o1Lift ?? 4.1, durationSec: 90, transcript: OWN_WIN },
  { id: "o2", ownerHandle: "ornekmarka", isOwn: true, lift: over.o2Lift ?? 1.8, durationSec: 60, transcript: OWN_NEIGHBOUR },
  { id: "o3", ownerHandle: "ornekmarka", isOwn: true, lift: 1.6, durationSec: 50, transcript: "Another note about patience and slow mornings that nobody asked for." },
];

const context = (over: Partial<IdeaValidationContext> = {}, evidence: IdeaEvidenceContent[] = ownEvidence()): IdeaValidationContext => ({
  language: "en",
  evidence: indexById(evidence),
  directions,
  verifiedTraitKeys: new Set(voice().traits.filter((t) => t.verified).map((t) => t.key)),
  ...over,
});

const ownIdea = (over: Parameters<typeof rawIdea>[0] = {}) =>
  rawIdea({ evidenceIds: ["o1", "o2"], quotes: [{ contentId: "o1", text: "the quiet ninety second rule changed how I answer anger" }], ctaType: "follow", ...over });

const reasonsOf = (verdict: ReturnType<typeof validateIdea>): string => (verdict.ok ? "" : verdict.dropped.reasons.join(" | "));

describe("kanıt kuralı moda göre değişir", () => {
  it("rakipsiz mod: ≥ 2 kanıt + ≥ 1 KENDİ tutanı yeter; rakip kanıtı/alıntısı aranmaz; fikir modu taşır", () => {
    const verdict = validateIdea(ownIdea(), context({ mode: "own" }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.idea.mode).toBe("own");
    expect(verdict.idea.relaxedOutlier).toBe(false);
    expect(verdict.idea.details.quotes).toEqual([{ contentItemId: "o1", ownerHandle: "ornekmarka", text: "the quiet ninety second rule changed how I answer anger" }]);
  });

  it("aynı fikir rakip modunda düşer (kanıtlar arasında rakip tutanı yok)", () => {
    const verdict = validateIdea(ownIdea(), context({ mode: "rivals" }));
    expect(verdict.ok).toBe(false);
    expect(reasonsOf(verdict)).toContain("rakip tutanı");
  });

  it("rakipsiz mod: havuzda ≥ 3x kendi tutan varken yalnız zayıf kendi videolarını kanıt göstermek geçersiz", () => {
    const verdict = validateIdea(ownIdea({ evidenceIds: ["o2", "o3"], quotes: [{ contentId: "o2", text: "You are allowed to begin again" }] }), context({ mode: "own" }));
    expect(verdict.ok).toBe(false);
    expect(reasonsOf(verdict)).toContain("kendi tutanı (lift ≥ 3) yok (havuzda var");
  });

  it("rakipsiz mod: havuzda ≥ 3x yoksa ≥ 1,5x kabul edilir ve `relaxedOutlier` ile işaretlenir; 1,5x'in altı düşer", () => {
    const weakPool = ownEvidence({ o1Lift: 2.2 });
    const relaxed = validateIdea(ownIdea(), context({ mode: "own" }, weakPool));
    expect(relaxed.ok && relaxed.idea.relaxedOutlier).toBe(true);

    const none = validateIdea(ownIdea(), context({ mode: "own" }, ownEvidence({ o1Lift: 1.2, o2Lift: 1.1 })));
    expect(none.ok).toBe(false);
    expect(reasonsOf(none)).toContain("havuzda da yok; en az 1.5x");
  });

  it("rakipsiz mod: doğrulanmış kendi alıntısı yoksa düşer (alıntı kendi tutan kanıtından birebir olmalı)", () => {
    const verdict = validateIdea(ownIdea({ quotes: [{ contentId: "o1", text: "this sentence is not in the video at all" }] }), context({ mode: "own" }));
    expect(verdict.ok).toBe(false);
    expect(reasonsOf(verdict)).toContain("doğrulanmış kendi tutan alıntısı yok");
  });
});

describe("hesap türü: CTA uyumu ve fikir amacı", () => {
  const withType = (accountType: IdeaValidationContext["accountType"]) => context({ mode: "own", accountType });

  it("creator: satış CTA'sı fikri DÜŞÜRMEZ ama notta ve gerekçede uyarı yazar; takip/kaydet/paylaş ve CTA yok uyarı almaz", () => {
    const sales = validateIdea(ownIdea({ ctaType: "comment_keyword" }), withType("creator"));
    expect(sales.ok).toBe(true);
    if (sales.ok) {
      expect(sales.idea.notes.some((n) => n.startsWith("CTA önerisi"))).toBe(true);
      expect(sales.idea.rationale).toContain(ctaMismatchNote(CTA_TYPE_LABEL.comment_keyword, "erişim ve takipçi: satış CTA'sı önerilmez"));
      expect(sales.idea.purpose).toBe("reach");
    }
    for (const ctaType of ["follow", "save_share", "none"] as const) {
      const ok = validateIdea(ownIdea({ ctaType }), withType("creator"));
      expect(ok.ok && ok.idea.notes.some((n) => n.startsWith("CTA önerisi"))).toBe(false);
    }
  });

  it("business: CTA'ya bakılmaz (davranış aynı), amaç satış; tür verilmezse amaç yok", () => {
    const business = validateIdea(ownIdea({ ctaType: "follow" }), withType("business"));
    expect(business.ok && business.idea.notes.some((n) => n.startsWith("CTA önerisi"))).toBe(false);
    expect(business.ok && business.idea.purpose).toBe("sales");
    const untyped = validateIdea(ownIdea(), context({ mode: "own" }));
    expect(untyped.ok && untyped.idea.purpose).toBeUndefined();
  });

  it("mixed: amaç modelin etiketinden; etiket yoksa CTA'dan (işletme CTA'sı satış, diğeri erişim)", () => {
    const tagged = validateIdea(ownIdea({ purpose: "sales", ctaType: "follow" }), withType("mixed"));
    expect(tagged.ok && tagged.idea.purpose).toBe("sales");
    const fromCta = validateIdea(ownIdea({ ctaType: "link_in_bio" }), withType("mixed"));
    expect(fromCta.ok && fromCta.idea.purpose).toBe("sales");
    const reach = validateIdea(ownIdea({ ctaType: "save_share" }), withType("mixed"));
    expect(reach.ok && reach.idea.purpose).toBe("reach");
  });
});

describe("generateIdeas: istem", () => {
  const input = (over: Partial<GenerateIdeasInput> = {}): GenerateIdeasInput => ({ ownerHandle: "ornekmarka", language: "tr", directions, evidence: ownEvidence(), voice: voice(), mode: "own", ...over });
  const run = async (over: Partial<GenerateIdeasInput>) => {
    const llm = createFakeLlm({ ideas: [ownIdea()] });
    await generateIdeas(llm.backend, input(over)).catch(() => undefined);
    return { stdin: llm.calls[0]?.input as string, system: llm.calls[0]?.args?.join("\n") ?? "" };
  };

  it("creator: amaç ve yalnız takip/kaydet-paylaş CTA'ları isteme girer, 'satış yok' kuralı yazılır; rakipsiz kanıt kuralı", async () => {
    const { stdin, system } = await run({ accountType: "creator" });
    expect(stdin).toContain("<account>");
    expect(stdin).toContain('"ctaTypes":["follow","save_share"]');
    expect(stdin).toContain("Seri");
    expect(stdin).not.toContain("comment_keyword");
    expect(system).toContain("does not sell anything");
    expect(system).toContain("OWN videos that clearly outperformed");
  });

  it("mixed: fikir amacı etiketi ve hedef pay (8 fikirde 5 erişim / 3 satış) istenir; CTA'lar iki kümenin birleşimi", async () => {
    const { stdin, system } = await run({ accountType: "mixed" });
    expect(system).toContain("Goals are mixed");
    expect(system).toContain("about 5 reach and 3 sales ideas out of 8");
    expect(stdin).toContain("comment_keyword");
    expect(stdin).toContain("save_share");
  });

  it("tür verilmezse hesap bloğu ve amaç kuralı yok (eski davranış); rakip modunda rakip tutanı kuralı", async () => {
    const { stdin, system } = await run({ mode: undefined, evidence: [...ownEvidence(), { id: "r1", ownerHandle: "x", isOwn: false, lift: 4, transcript: "rival words go here for the evidence pool" }] });
    expect(stdin).not.toContain("<account>");
    expect(system).not.toContain("Goals are mixed");
    expect(system).toContain("MUST be a competitor video");
  });

  it("rakipsiz modda kendi içerik yoksa model çağrılmaz (hata); rakip modunda rakip içerik şart", async () => {
    const llm = createFakeLlm({ ideas: [ownIdea()] });
    const rivalsOnly: IdeaEvidenceContent[] = [
      { id: "r1", ownerHandle: "x", isOwn: false, lift: 4, transcript: "alpha beta gamma" },
      { id: "r2", ownerHandle: "y", isOwn: false, lift: 3, transcript: "delta epsilon zeta" },
    ];
    await expect(generateIdeas(llm.backend, input({ evidence: rivalsOnly }))).rejects.toThrow(/en az 1 kendi içeriği/);
    await expect(generateIdeas(llm.backend, input({ mode: "rivals", evidence: ownEvidence() }))).rejects.toThrow(/en az 1 rakip içeriği/);
    expect(llm.calls).toHaveLength(0);
  });
});
