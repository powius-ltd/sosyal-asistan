/**
 * Plan geri beslemesi (çarpan sınırları, n < 2, son 4 hafta, notlar) ve yön puanı büzmesi (az örnekli uç değer baza çekilir).
 * Sayılar docs/FAZ2-KAPANIS-PLAN.md §2'den: n=2, 6,9x → ≈2,7; n=5, 4,5x → 2,75; çarpan clamp(1 + 0,05·(tuttu − tutmadı), 0,85, 1,15).
 */
import { describe, expect, it } from "vitest";

import type { DirectionReview } from "@/lib/domain/outcomes";
import {
  applyFeedbackNotes,
  buildFeedback,
  feedbackMultiplier,
  feedbackNote,
  multiplierFor,
  previousWeeks,
  type FeedbackReview,
} from "@/lib/insights/feedback";
import { groupKeyId, scoreGroups, shrinkImpact } from "@/lib/insights/groups";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { buildPool } from "@/lib/insights/pool";
import { planInput, rivalVideos } from "@/lib/insights/testing/builders";

const direction = (value: string, held: number, missed: number, unmeasured = 0): DirectionReview => ({ group: "duration_bucket", value, label: value, held, missed, unmeasured });
const review = (weekStart: string, ...directions: DirectionReview[]): FeedbackReview => ({ weekStart, directions });

describe("çarpan: clamp(1 + 0,05·(tuttu − tutmadı), 0,85, 1,15)", () => {
  it("n < 2 ise 1 (tek sonuç yön puanını oynatmaz)", () => {
    expect(multiplierFor(0, 0)).toBe(1);
    expect(multiplierFor(1, 0)).toBe(1);
    expect(multiplierFor(0, 1)).toBe(1);
  });

  it("n ≥ 2: tuttukça artar, tutmadıkça azalır; eşitlik 1", () => {
    expect(multiplierFor(2, 0)).toBe(1.1);
    expect(multiplierFor(1, 1)).toBe(1);
    expect(multiplierFor(0, 2)).toBe(0.9);
    expect(multiplierFor(3, 1)).toBe(1.1);
  });

  it("sınırlar: en çok 1,15, en az 0,85", () => {
    expect(multiplierFor(3, 0)).toBe(1.15);
    expect(multiplierFor(9, 0)).toBe(1.15);
    expect(multiplierFor(0, 3)).toBe(0.85);
    expect(multiplierFor(0, 9)).toBe(0.85);
  });
});

describe("buildFeedback", () => {
  it("haftalar toplanır; ölçülemedi sonuçları n'e girmez (0 değil)", () => {
    const index = buildFeedback([review("2026-09-28", direction("over_90", 1, 0, 3)), review("2026-09-21", direction("over_90", 1, 0))]);
    expect(index.get("duration_bucket:over_90")).toMatchObject({ held: 2, missed: 0, n: 2, multiplier: 1.1 });
  });

  it("yalnız ölçülemeyen yön kaydı oluşturmaz → çarpan 1", () => {
    const index = buildFeedback([review("2026-09-28", direction("over_90", 0, 0, 2))]);
    expect(index.size).toBe(0);
    expect(feedbackMultiplier(index.get("duration_bucket:over_90"))).toBe(1);
  });

  it("n=1 kayıt tutulur ama çarpan 1 ve not yok", () => {
    const fb = buildFeedback([review("2026-09-28", direction("over_90", 1, 0))]).get("duration_bucket:over_90");
    expect(fb).toMatchObject({ n: 1, multiplier: 1 });
    expect(feedbackNote(fb)).toBeUndefined();
  });

  it("yalnız son 4 hafta sayılır (en eskisi düşer); aynı hafta iki kez gelirse tek sayılır", () => {
    const weeks = ["2026-09-28", "2026-09-21", "2026-09-14", "2026-09-07", "2026-08-31"];
    const index = buildFeedback([...weeks.map((w) => review(w, direction("over_90", 1, 0))), review("2026-09-28", direction("over_90", 1, 0))]);
    expect(index.get("duration_bucket:over_90")).toMatchObject({ held: 4, n: 4, multiplier: 1.15 });
  });
});

describe("previousWeeks", () => {
  it("W−7, W−14, W−21, W−28 (Pazartesi'ler); Pazartesi olmayan gün haftasına hizalanır; geçersiz gün boş", () => {
    expect(previousWeeks("2026-10-05")).toEqual(["2026-09-28", "2026-09-21", "2026-09-14", "2026-09-07"]);
    expect(previousWeeks("2026-10-07", 1)).toEqual(["2026-09-28"]);
    expect(previousWeeks("2026-02-31")).toEqual([]);
  });
});

describe("not ve gerekçe", () => {
  const fb = (held: number, missed: number) => buildFeedback([review("2026-09-28", direction("over_90", held, missed))]).get("duration_bucket:over_90");

  it("tuttu / tutmadı / karışık, n ile", () => {
    expect(feedbackNote(fb(2, 0))).toBe("Geçen haftalarda bu yön tuttu (2 yayına baktım: 2 tuttu, 0 tutmadı).");
    expect(feedbackNote(fb(0, 3))).toContain("tutmadı (3 yayına");
    expect(feedbackNote(fb(2, 2))).toContain("karışık sonuç verdi (4 yayına");
  });

  it("applyFeedbackNotes gerekçeye ekler, yeniden uygulamada tekrarlamaz; geri bildirimsiz yöne dokunmaz", () => {
    const index = buildFeedback([review("2026-09-28", direction("over_90", 2, 0))]);
    const base = { group: "duration_bucket" as const, label: "x", novelty: 1, score: 1, sampleSize: 3, confidence: "low" as const, ownTried: false, evidenceContentIds: [] };
    const focus = { directions: [{ ...base, value: "over_90", rationale: "LLM metni." }, { ...base, value: "30_60", rationale: "Başka." }] };
    const once = applyFeedbackNotes(focus, index);
    expect(once.directions[0].rationale).toBe("LLM metni. Geçen haftalarda bu yön tuttu (2 yayına baktım: 2 tuttu, 0 tutmadı).");
    expect(once.directions[1].rationale).toBe("Başka.");
    expect(applyFeedbackNotes(once, index)).toEqual(once);
  });
});

describe("yön puanı büzmesi: etki' = 1 + (etki − 1)·n/(n+5)", () => {
  it("n=2, 6,9x → ≈2,7; n=5, 4,5x → 2,75; çok örnekli ılımlı yön uç değere yaklaşır", () => {
    expect(shrinkImpact(6.9, 2)).toBeCloseTo(2.6857, 3);
    expect(shrinkImpact(4.5, 5)).toBeCloseTo(2.75, 9);
    expect(shrinkImpact(2, 100)).toBeCloseTo(1.952, 3);
  });

  it("baz çizgisinin altı da baza çekilir; ölçülemeyen etki undefined (0 değil)", () => {
    expect(shrinkImpact(0.5, 5)).toBeCloseTo(0.75, 9);
    expect(shrinkImpact(undefined, 5)).toBeUndefined();
  });

  const items = [...rivalVideos("A", "noelle", 120, [6.8, 7.0]), ...rivalVideos("B", "align", 50, [4.5, 4.5, 4.5, 4.5, 4.5])];

  it("az örnekli uç değer (n=2, 6,9x) çok örnekli yönün (n=5, 4,5x) önüne geçmez; gösterilen etki ham kalır", () => {
    const groups = scoreGroups(buildPool(planInput(items)));
    expect(groups.map((g) => g.value).slice(0, 2)).toEqual(["30_60", "over_90"]);
    const [b, a] = groups;
    expect(a.impact).toBeCloseTo(6.9, 9);
    expect(b.impact).toBeCloseTo(4.5, 9);
    expect(a.score).toBeCloseTo(shrinkImpact(6.9, 2)! * 1.5, 9);
  });

  it("plan taslağında ilk yön büzülmüş puanla seçilir; `impact` ham, `score` büzülmüş", () => {
    const first = buildPlanDraft(planInput(items)).sections.focus.directions[0];
    expect(first).toMatchObject({ value: "30_60", sampleSize: 5 });
    expect(first.impact).toBeCloseTo(4.5, 9);
    expect(first.score).toBeCloseTo(2.75 * 1.5, 9);
  });
});

describe("geri besleme plana girer", () => {
  const items = [...rivalVideos("A", "noelle", 120, [1.5, 1.6, 1.7]), ...rivalVideos("B", "align", 50, [1.5, 1.6, 1.7])];
  // Eşit puanda "30_60" alfabetik önde gelir: geri besleme "over_90"ı öne almalı (tutan), "30_60"ı geriye (tutmayan).
  const reviews = [review("2026-09-28", direction("over_90", 2, 0), direction("30_60", 0, 2))];
  const draft = buildPlanDraft(planInput(items, { reviews }));
  const byValue = (value: string) => scoreGroups(buildPool(planInput(items)), buildFeedback(reviews)).find((g) => g.value === value);

  it("tutan yön puanı 1,1, tutmayan 0,9 ile çarpılır; etki (gösterilen) değişmez", () => {
    const plain = scoreGroups(buildPool(planInput(items)));
    for (const [value, factor] of [["over_90", 1.1], ["30_60", 0.9]] as const) {
      const base = plain.find((g) => g.value === value);
      expect(byValue(value)?.score).toBeCloseTo((base?.score ?? 0) * factor, 9);
      expect(byValue(value)?.impact).toBe(base?.impact);
    }
    expect(groupKeyId({ group: "duration_bucket", value: "over_90" })).toBe("duration_bucket:over_90");
  });

  it("sıra geri beslemeyle değişir ve gerekçeye not düşer; geri besleme yoksa not yok", () => {
    const noFeedback = buildPlanDraft(planInput(items)).sections.focus.directions;
    expect(noFeedback.every((d) => !d.rationale?.includes("Geçen haftalarda"))).toBe(true);
    const withFeedback = draft.sections.focus.directions.filter((d) => d.group === "duration_bucket");
    expect(noFeedback.filter((d) => d.group === "duration_bucket")[0].value).toBe("30_60");
    expect(withFeedback[0].value).toBe("over_90");
    expect(withFeedback[0].rationale).toContain("tuttu (2 yayına baktım: 2 tuttu, 0 tutmadı)");
  });
});
