import { describe, expect, it } from "vitest";

import { indexById } from "@/lib/llm/content-text";
import { directions, evidenceList, rawIdea, voice } from "@/lib/llm/generate-ideas-fixtures";
import { validateIdea, type IdeaValidationContext } from "@/lib/llm/generate-ideas-validate";

const context = (over: Partial<IdeaValidationContext> = {}): IdeaValidationContext => ({
  language: "en",
  evidence: indexById(evidenceList()),
  directions,
  verifiedTraitKeys: new Set(voice().traits.filter((t) => t.verified).map((t) => t.key)),
  ...over,
});
const reasonsOf = (verdict: ReturnType<typeof validateIdea>): string => (verdict.ok ? "" : verdict.dropped.reasons.join(" | "));

const ownIdea = (rationale: string) => rawIdea({ rationale, evidenceIds: ["o1", "r1"], quotes: [{ contentId: "o1", text: "You are allowed to begin again" }] });

describe("validateIdea: rakipsiz mod dili", () => {
  it("mod own + gerekçede 'rakiplerde' → fikir düşer; mod rivals → serbest", () => {
    const text = "Bu biçim rakiplerde işe yaramış.";
    expect(reasonsOf(validateIdea(ownIdea(text), context({ mode: "own" })))).toContain("rationale: bu hesapta rakip verisi yok");
    expect(validateIdea(rawIdea({ rationale: text }), context({ mode: "rivals" })).ok).toBe(true);
  });

  it("mod own + rakipsiz gerekçe geçer", () => {
    expect(validateIdea(ownIdea("Kendi kısa videon tutmuş; bu onun devamı."), context({ mode: "own" })).ok).toBe(true);
  });
});

describe("validateIdea: güven dili", () => {
  it("düşük güvenli yön (F2) + 'bundan eminim' → düşer; orta güvenli yönde 'kesinlikle' düşer; ölçülü ifade geçer", () => {
    expect(reasonsOf(validateIdea(rawIdea({ directionRef: "F2", rationale: "Bundan eminim, bu açılış tutar." }), context()))).toContain("dayanak güveni düşük");
    expect(reasonsOf(validateIdea(rawIdea({ directionRef: "F1", rationale: "Kesinlikle tutar." }), context()))).toContain("dayanak güveni orta");
    expect(validateIdea(rawIdea({ directionRef: "F1", rationale: "Denemeye değer; işe yarayabilir." }), context()).ok).toBe(true);
  });

  it("yüksek güvenli slot dayanağında kesinlik sözü serbest; düşük güvenli slotta sorun", () => {
    const slotCtx = (confidence: string) => context({ briefSlotIds: new Set(["S1"]), slotConfidence: new Map([["S1", confidence]]) });
    const idea = rawIdea({ directionRef: undefined, slotId: "S1", rationale: "Bundan eminim." });
    expect(validateIdea(idea, slotCtx("high")).ok).toBe(true);
    expect(reasonsOf(validateIdea(idea, slotCtx("low")))).toContain("dayanak güveni düşük");
  });
});
