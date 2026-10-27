/**
 * Rakipsiz mod (plan kendi tutanlarından öğrenir) ve slot karması testleri. Rakip verisi varken davranışın DEĞİŞMEDİĞİ de burada sabitlenir
 * (asıl rakip senaryoları `sections.test.ts` / `plan-draft.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { REPEAT_VALUE } from "@/lib/insights/repeat";
import { inferPurposeFromCta, purposeOfType, slotPurposes } from "@/lib/insights/slot-mix";
import { planInput, rivalVideos, video } from "@/lib/insights/testing/builders";
import { fixtureItems } from "@/lib/insights/testing/faz2-fixture";

/** Kendi videoları: uzun (100 sn) olanlar tutmuş, kısa (20 sn) olanlar tutmamış; hiç rakip yok. */
const ownOnly = () => [
  ...[5.9, 4.3, 4, 3.5, 3.2, 1.8].map((lift, i) => video({ id: `L${i + 1}`, owner: "ornek", dur: 100, lift, daysAgo: 3 + i })),
  ...[0.9, 0.8, 0.7, 0.6, 0.5].map((lift, i) => video({ id: `S${i + 1}`, owner: "ornek", dur: 20, lift, daysAgo: 12 + i })),
];

describe("rakipsiz mod", () => {
  const draft = buildPlanDraft(planInput(ownOnly(), { competitors: [] }));

  it("rakip yokken mod `own`: yön, aday ve 'ne tuttu' kendi videolarından çıkar (boş plan değil)", () => {
    expect(draft.mode).toBe("own");
    expect(draft.modeNote).toMatch(/kendi tutan videolarından öğreniyor/);
    expect(draft.sections.winners.rivals).toEqual([]);
    expect(draft.sections.winners.own.map((w) => w.contentItemId)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    expect(draft.sections.focus.directions.length).toBeGreaterThanOrEqual(2);
    expect(draft.candidates.length).toBeGreaterThanOrEqual(3);
    expect(WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(draft.sections).success).toBe(true);
  });

  it("yönler: yenilik çarpanı YOK (1), gerekçede dayanak 'kendi tutanların', 'Tekrarla / seriye çevir' yönü var", () => {
    const { directions } = draft.sections.focus;
    expect(directions.every((d) => d.novelty === 1 && d.ownTried)).toBe(true);
    expect(directions.every((d) => d.rationale?.includes("kendi tutanların"))).toBe(true);
    const repeat = directions.find((d) => d.value === REPEAT_VALUE);
    expect(repeat).toMatchObject({ label: "Tekrarla / seriye çevir", sampleSize: 3, confidence: "low" });
    expect(repeat?.evidenceContentIds).toEqual(["L1", "L2", "L3"]);
    expect(directions.length).toBeLessThanOrEqual(3);
  });

  it("aday: tohum kendi tutanıdır; kanıt ≥ 2 ve hepsi kendi videosu; rakip tutanı alanı boş, kendi tutanı dolu", () => {
    for (const c of draft.candidates) {
      expect(c.basis).toBe("own");
      expect(c.rivalWinnerIds).toEqual([]);
      expect(c.ownWinnerIds.length).toBeGreaterThanOrEqual(1);
      expect(c.evidenceContentIds.length).toBeGreaterThanOrEqual(2);
      expect(c.evidenceContentIds.every((id) => id.startsWith("L") || id.startsWith("S"))).toBe(true);
      expect(c.novelty).toBe(1);
      expect(c.ownTopicMatch).toBeUndefined();
    }
    expect(draft.candidates[0].seedContentItemId).toBe("L1");
  });

  it("kısa videolar kendi verisinden 'kaçın' olur ve gerekçe 'kendi videolarında' der (rakip metni değil)", () => {
    const entry = draft.sections.avoid.entries.find((e) => e.value === "under_30" || e.label.includes("30"));
    expect(entry?.reason).toContain("kendi videolarında");
  });

  it("kendi videosu da yoksa mod değişmez (boş veri davranışı aynı): `rivals`", () => {
    const empty = buildPlanDraft(planInput([], { own: [], competitors: [] }));
    expect(empty.mode).toBe("rivals");
    expect(empty.sections.focus.directions).toEqual([]);
  });

  it("kendi tutan yoksa 'tekrarla' yönü yok (tutan uydurulmaz)", () => {
    const flat = ownOnly().map((item, i) => video({ id: item.id, owner: "ornek", dur: item.durationSec, lift: 0.5 + i * 0.01, daysAgo: 3 + i }));
    const result = buildPlanDraft(planInput(flat, { competitors: [] }));
    expect(result.sections.focus.directions.some((d) => d.value === REPEAT_VALUE)).toBe(false);
  });
});

describe("rakip verisi varken davranış değişmez", () => {
  it("yeterli rakip verisi (Ornek senaryosu): mod `rivals`, adaylar rakip tutanlı, yönlerde yenilik uygulanır", () => {
    const rival = buildPlanDraft(planInput(fixtureItems));
    expect(rival.mode).toBe("rivals");
    expect(rival.candidates.length).toBeGreaterThan(0);
    for (const c of rival.candidates) {
      expect(c.basis).toBe("rivals");
      expect(c.ownWinnerIds).toEqual([]);
      expect(c.rivalWinnerIds.length).toBeGreaterThanOrEqual(1);
    }
    expect(rival.sections.focus.directions.some((d) => d.value === REPEAT_VALUE)).toBe(false);
    expect(rival.sections.focus.directions.every((d) => d.rationale?.includes("rakiplerde"))).toBe(true);
  });

  it("az rakip (< 5 ölçülmüş) ama rakip verisi yön çıkarıyorsa mod `rivals` kalır (kendi videosu rakibin yerine geçmez)", () => {
    const items = [...rivalVideos("L", "noelle", 120, [1.4, 1.6, 1.2]), video({ id: "mine", owner: "ornek", dur: 100, lift: 5 })];
    const draft = buildPlanDraft(planInput(items));
    expect(draft.mode).toBe("rivals");
    expect(draft.sections.focus.directions[0]).toMatchObject({ value: "over_90", ownTried: true, novelty: 1 });
  });
});

describe("plan karması (slot amacı)", () => {
  it("karma: splitPlanSlots sayıları, dönüşümlü dizilim (3 → erişim, satış, erişim; 5 → 3 erişim / 2 satış)", () => {
    expect(slotPurposes("mixed", 3)).toEqual(["reach", "sales", "reach"]);
    expect(slotPurposes("mixed", 4)).toEqual(["reach", "sales", "reach", "sales"]);
    const five = slotPurposes("mixed", 5);
    expect(five.filter((p) => p === "reach")).toHaveLength(3);
    expect(five.filter((p) => p === "sales")).toHaveLength(2);
    expect(five).toEqual(["reach", "sales", "reach", "sales", "reach"]);
  });

  it("tek amaçlı türde hepsi aynı amaç: business → satış, creator → erişim", () => {
    expect(slotPurposes("business", 4)).toEqual(["sales", "sales", "sales", "sales"]);
    expect(slotPurposes("creator", 3)).toEqual(["reach", "reach", "reach"]);
    expect(slotPurposes("mixed", 0)).toEqual([]);
  });

  it("türün tek amacı: karma undefined (fikir başına); fikir amacı CTA'dan çıkarılır (işletme CTA'sı satış, diğeri erişim)", () => {
    expect(purposeOfType("business")).toBe("sales");
    expect(purposeOfType("creator")).toBe("reach");
    expect(purposeOfType("mixed")).toBeUndefined();
    expect(inferPurposeFromCta("comment_keyword")).toBe("sales");
    expect(inferPurposeFromCta("follow")).toBe("reach");
    expect(inferPurposeFromCta(undefined)).toBe("reach");
  });
});
