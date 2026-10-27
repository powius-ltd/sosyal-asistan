/** `generate-ideas`: kreatif direktör brifi (slot bağı). Brifsiz yol `generate-ideas.test.ts`'te; burada yalnız brifin fark yarattığı yerler. */
import { describe, expect, it } from "vitest";

import { createFakeLlm } from "@/lib/llm/backend-fake";
import { briefContextOf } from "@/lib/llm/creative-brief";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import { finalizeBrief } from "@/lib/llm/creative-brief-validate";
import { generateIdeas, type GenerateIdeasInput } from "@/lib/llm/generate-ideas";
import { directions, evidenceList, rawIdea, voice } from "@/lib/llm/generate-ideas-fixtures";
import { validateIdea } from "@/lib/llm/generate-ideas-validate";
import { indexById } from "@/lib/llm/content-text";

const brief = finalizeBrief(validRawBrief(), briefContextOf(BRIEF_INPUT));
const SLOTS = ["S1", "S2", "S3", "S4"];

const input = (over: Partial<GenerateIdeasInput> = {}): GenerateIdeasInput => ({ ownerHandle: "ornek", language: "en", directions, evidence: evidenceList(), voice: voice(), ...over });
const ideaFor = (slotId: string | undefined, n: number) => rawIdea({ title: `Fikir ${n}`, slotId });
/** 6 fikir: S1..S4'ün hepsi + S1 ve S2 için birer alternatif. */
const allSlots = () => [...SLOTS, "S1", "S2"].map((slotId, n) => ideaFor(slotId, n));

describe("validateIdea: brif slotu", () => {
  const ctx = { language: "en" as const, evidence: indexById(evidenceList()), directions, verifiedTraitKeys: new Set(["direct-address"]), briefSlotIds: new Set(SLOTS) };

  it("geçerli slotId'li fikir geçer ve slotId'yi taşır", () => {
    const verdict = validateIdea(ideaFor("S2", 1), ctx);
    expect(verdict.ok && verdict.idea.slotId).toBe("S2");
  });

  it("slotId'siz ya da bilinmeyen slotId'li fikir DÜŞER", () => {
    for (const slotId of [undefined, "S9"]) {
      const verdict = validateIdea(ideaFor(slotId, 1), ctx);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.dropped.reasons.join(" ")).toContain("brifteki bir slota bağlı değil");
    }
  });

  it("brif yoksa slotId aranmaz ve fikir slotId taşımaz (eski yol)", () => {
    const verdict = validateIdea(ideaFor(undefined, 1), { ...ctx, briefSlotIds: undefined });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.idea).not.toHaveProperty("slotId");
  });
});

describe("generateIdeas: brif", () => {
  it("brifli: istem <brief> bloğu ve slot kanıtını taşır; tüm slotlar doluysa tek çağrı", async () => {
    const llm = createFakeLlm({ ideas: allSlots() });
    const outcome = await generateIdeas(llm.backend, input({ brief, briefEvidence: { "topic:c1:question": ["r1", "o1"] } }));
    expect(outcome.meetsMinimum).toBe(true);
    expect(outcome.uncoveredSlots).toEqual([]);
    expect(outcome.ideas.map((idea) => idea.slotId)).toEqual(["S1", "S2", "S3", "S4", "S1", "S2"]);
    expect(llm.calls).toHaveLength(1);
    const stdin = llm.calls[0].input as string;
    expect(stdin).toContain("<brief>");
    expect(stdin).toContain('"evidenceIds":["r1","o1"]');
    expect(llm.calls[0].args?.join(" ") ?? "").toContain("slotId");
  });

  it("bağsız fikirler düşer ve slot boş kalırsa düzeltme turu yapılır", async () => {
    const missingS4 = [...SLOTS.slice(0, 3), "S1", "S2", "S3"].map((slotId, n) => ideaFor(slotId, n));
    const llm = createFakeLlm({ ideas: [...missingS4, ideaFor(undefined, 9)] }, { ideas: allSlots() });
    const outcome = await generateIdeas(llm.backend, input({ brief }));
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].input as string).toContain("Fikri olmayan brif slotları: S4");
    expect(outcome.uncoveredSlots).toEqual([]);
    expect(outcome.ideas.every((idea) => idea.slotId !== undefined)).toBe(true);
    expect(outcome.dropped).toEqual([]);
  });

  it("düzeltmeye rağmen boş slot: uncoveredSlots söyler, bağsız fikir yine düşer", async () => {
    const noS4 = [...SLOTS.slice(0, 3), "S1", "S2", "S3"].map((slotId, n) => ideaFor(slotId, n));
    const llm = createFakeLlm({ ideas: [...noS4, ideaFor(undefined, 9)] });
    const outcome = await generateIdeas(llm.backend, input({ brief }));
    expect(outcome.uncoveredSlots).toEqual(["S4"]);
    expect(outcome.dropped.map((drop) => drop.title)).toEqual(["Fikir 9"]);
    expect(outcome.ideas.every((idea) => idea.slotId !== undefined)).toBe(true);
  });

  it("brifsiz: istem <brief> içermez, uncoveredSlots boş, fikirler slotId taşımaz (bugünkü yol)", async () => {
    const llm = createFakeLlm({ ideas: Array.from({ length: 6 }, (_, n) => rawIdea({ title: `Fikir ${n}` })) });
    const outcome = await generateIdeas(llm.backend, input());
    expect(outcome.meetsMinimum).toBe(true);
    expect(outcome.uncoveredSlots).toEqual([]);
    expect(outcome.ideas.some((idea) => idea.slotId !== undefined)).toBe(false);
    expect(llm.calls[0].input as string).not.toContain("<brief>");
    expect(llm.calls).toHaveLength(1);
  });
});
