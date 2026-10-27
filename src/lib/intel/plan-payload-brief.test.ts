/** `plan-payload`: kreatif direktör brifi (slot sırası, slot gerekçesi, RPC'ye slot kimliği gitmez) ve brifsiz yolun değişmemesi. */
import { describe, expect, it } from "vitest";

import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { briefContextOf } from "@/lib/llm/creative-brief";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import { finalizeBrief } from "@/lib/llm/creative-brief-validate";
import type { GeneratedIdea } from "@/lib/llm/generate-ideas-validate";
import { orderForBrief, rankIdeas, toPayloadIdeas } from "@/lib/intel/plan-payload";

const brief = finalizeBrief(validRawBrief(), briefContextOf(BRIEF_INPUT));
const idea = (title: string, lift: number, slotId?: string): GeneratedIdea => ({
  title,
  rationale: "r",
  hooks: ["a", "b", "c"],
  hookType: "bold_claim",
  scriptOutline: ["s"],
  details: {},
  evidence: [{ contentItemId: `r-${title}`, liftAtCreation: lift }],
  relaxedOutlier: false,
  notes: [],
  ...(slotId === undefined ? {} : { slotId }),
});
const schedule: WeeklyPlanSections["schedule"] = {
  postsPerWeek: 4,
  audienceTimeZone: "America/New_York",
  slots: [1, 2, 3, 4].map((position) => ({ position, at: `2026-10-2${6 + position}T15:00:00.000Z`, weekday: position, hour: 11, basis: "own_good" as const })),
};
const isOwn = () => false;

describe("brifli plan sırası", () => {
  // Puan sırası: b(9) > a(8) > d(7) > c(6) > e(5); slotlar: a→S2, b→S1, c→S3, d→S4, e→S1 (S1 alternatifi)
  const ideas = [idea("a", 8, "S2"), idea("b", 9, "S1"), idea("c", 6, "S3"), idea("d", 7, "S4"), idea("e", 5, "S1")];
  const ranked = rankIdeas(ideas, isOwn);

  it("plana girenler S1..S4 sırasında, slot başına en yüksek puanlı fikir; alternatif aday olur", () => {
    const { ordered, chosen } = orderForBrief(ranked, brief);
    expect(ordered.map((r) => r.idea.title)).toEqual(["b", "a", "c", "d", "e"]);
    expect(chosen).toBe(4);
    const payload = toPayloadIdeas(ranked, schedule, { brief });
    expect(payload.map((p) => [p.title, p.position, p.brief_slot])).toEqual([
      ["b", 1, "S1"],
      ["a", 2, "S2"],
      ["c", 3, "S3"],
      ["d", 4, "S4"],
      ["e", undefined, "S1"],
    ]);
  });

  it("slot notu brifteki 'neden'i taşır; takvim notu korunur", () => {
    const [first, , third] = toPayloadIdeas(ranked, schedule, { brief });
    expect(first.slot_note).toBe("Kendi iyi saatlerin · Bu konu birçok hesapta tutmuş.");
    expect(third.slot_note).toContain("Haftanın denemesi burada.");
  });

  it("RPC yüküne slot kimliği GİDER (weekly_plan_items.brief_slot); tüm fikirler bir slota bağlı", () => {
    const payload = toPayloadIdeas(ranked, schedule, { brief });
    expect(payload.every((p) => p.brief_slot !== undefined)).toBe(true);
    expect(JSON.parse(JSON.stringify(payload)).map((p: { brief_slot?: string }) => p.brief_slot)).toEqual(["S1", "S2", "S3", "S4", "S1"]);
  });

  it("fikri olmayan slot atlanır: plana giren sayısı dolu slot sayısı kadar", () => {
    const payload = toPayloadIdeas(rankIdeas([idea("a", 8, "S1"), idea("b", 9, "S3")], isOwn), schedule, { brief });
    expect(payload.map((p) => [p.title, p.position])).toEqual([["a", 1], ["b", 2]]);
  });
});

describe("brifsiz plan (bugünkü yol) değişmez", () => {
  it("brif verilmezse sıra puana göre, brief_slot yok, slot notunda brif metni yok", () => {
    const ranked = rankIdeas([idea("a", 8), idea("b", 9), idea("c", 6)], isOwn);
    const payload = toPayloadIdeas(ranked, schedule);
    expect(payload.map((p) => [p.title, p.position])).toEqual([["b", 1], ["a", 2], ["c", 3]]);
    expect(payload.some((p) => "brief_slot" in p)).toBe(false);
    expect(payload[0].slot_note).toBe("Kendi iyi saatlerin");
  });
});
