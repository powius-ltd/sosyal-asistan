/**
 * Baz çizgisi güven tavanı plan taslağında: bir grubun ölçülmüş videolarının ≥ %50'si düşük güvenli baz çizgisindeyse (baz çizgisi
 * < 10 içerik, `score.lowConfidence`) yön, kaçın girdisi ve aday güveni en çok orta olur; plan güveni bunların en zayıfıdır.
 */
import { describe, expect, it } from "vitest";

import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { planInput, video } from "@/lib/insights/testing/builders";

/** 10 rakip videosu (≥ 90 sn), iki tutan (3,5x; 3,2x) ve baz çizgisinin üstünde kalan çoğunluk; `lowBaseline` hangisinin düşük güvenli olduğunu seçer. */
const LIFTS = [3.5, 3.2, 1.8, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1, 1.05];
const rivals = (lowBaseline: (index: number) => boolean) => LIFTS.map((lift, i) => video({ id: `r${i + 1}`, owner: "noelle", dur: 95, lift, daysAgo: 3 + i, lowBaseline: lowBaseline(i) }));
const draftOf = (items: ReturnType<typeof rivals>) => buildPlanDraft(planInput(items));

describe("yön ve aday güveni", () => {
  it("10 ölçülmüş video: sağlam baz çizgisinde yüksek; tümü düşük güvenli baz çizgisinde orta (yön, aday ve plan)", () => {
    const solid = draftOf(rivals(() => false));
    expect(solid.sections.focus.directions[0]).toMatchObject({ group: "duration_bucket", value: "over_90", sampleSize: 10, confidence: "high" });
    expect(solid.candidates[0].confidence).toBe("high");
    expect(solid.confidence).toBe("high");

    const low = draftOf(rivals(() => true));
    expect(low.sections.focus.directions[0]).toMatchObject({ value: "over_90", sampleSize: 10, confidence: "medium" });
    expect(low.candidates[0].confidence).toBe("medium");
    expect(low.confidence).toBe("medium");
  });

  it("eşik %50: 5/10 düşük güvenli → orta; 4/10 → yüksek", () => {
    expect(draftOf(rivals((i) => i < 5)).sections.focus.directions[0].confidence).toBe("medium");
    expect(draftOf(rivals((i) => i < 4)).sections.focus.directions[0].confidence).toBe("high");
  });

  it("tavan yalnız düşürür: az örnekli (n < 5) yön düşük güvende kalır, yükselmez", () => {
    const few = LIFTS.slice(0, 4).map((lift, i) => video({ id: `f${i + 1}`, owner: "noelle", dur: 95, lift, daysAgo: 3 + i, lowBaseline: true }));
    expect(draftOf(few).sections.focus.directions[0]).toMatchObject({ sampleSize: 4, confidence: "low" });
  });
});

describe("kaçın güveni", () => {
  it("baz çizgisinin altındaki grup aynı tavana tabidir (10 örnek + düşük güvenli baz çizgisi → orta)", () => {
    const weak = Array.from({ length: 10 }, (_, i) => video({ id: `w${i + 1}`, owner: "noelle", dur: 20, lift: 0.4 + i / 100, daysAgo: 3 + i, lowBaseline: true }));
    const entry = draftOf(weak).sections.avoid.entries.find((e) => e.group === "duration_bucket");
    expect(entry).toMatchObject({ kind: "low_lift", value: "15_30", sampleSize: 10, confidence: "medium" });
    const solid = weak.map((c) => ({ ...c, score: { ...c.score, lowConfidence: false } }));
    expect(draftOf(solid).sections.avoid.entries.find((e) => e.group === "duration_bucket")?.confidence).toBe("high");
  });
});
