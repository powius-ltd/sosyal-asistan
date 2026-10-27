/**
 * Sebep metinleri kaynağında düz dildir (Dalga 3½): `lib/insights` her senaryoda (rakipli, rakipsiz, boş, niş dışı, geri beslemeli) müşteriye
 * gidecek hiçbir cümlede panel jargonu (`PANEL_JARGON`) ya da çarpan rozeti ("2,3x") üretmez. Ekrandaki `plainOrFallback` süzgeci bu yüzden
 * normal akışta devreye girmez.
 */
import { describe, expect, it } from "vitest";

import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { planInput, rivalVideos, video } from "@/lib/insights/testing/builders";
import { FIXTURE_COMPETITORS, FIXTURE_NOW, FIXTURE_OFF_NICHE, FIXTURE_OWN, FIXTURE_WORKSPACE, NEXT_WEEK, fixtureItems } from "@/lib/insights/testing/faz2-fixture";
import { MULTIPLIER_BADGE, PANEL_JARGON } from "@/lib/plain-language";

/** Taslaktaki müşteriye giden tüm sebep / gerekçe / not metinleri. */
function reasonTexts(sections: WeeklyPlanSections, modeNote: string): string[] {
  const { winners, focus, avoid, schedule } = sections;
  return [
    modeNote,
    winners.unmeasuredReason,
    focus.unmeasuredReason,
    ...focus.directions.flatMap((d) => [d.rationale, d.label]),
    ...avoid.entries.flatMap((e) => [e.reason, e.label]),
    schedule.unmeasuredReason,
    ...schedule.slots.map((slot) => slot.note),
  ].filter((text): text is string => text !== undefined && text.trim() !== "");
}

const ownOnly = () => [
  ...[5.9, 4.3, 4, 3.5, 3.2, 1.8].map((lift, i) => video({ id: `L${i + 1}`, owner: "ornek", dur: 100, lift, daysAgo: 3 + i })),
  ...[0.9, 0.8, 0.7, 0.6, 0.5].map((lift, i) => video({ id: `S${i + 1}`, owner: "ornek", dur: 20, lift, daysAgo: 12 + i })),
];

const SCENARIOS: Record<string, () => ReturnType<typeof buildPlanDraft>> = {
  "sabit veri seti (rakipli, niş dışı hesap, kaçın)": () =>
    buildPlanDraft({
      weekStart: NEXT_WEEK,
      now: FIXTURE_NOW,
      workspace: FIXTURE_WORKSPACE,
      own: FIXTURE_OWN,
      competitors: FIXTURE_COMPETITORS,
      items: fixtureItems,
      offNicheContentIds: [...FIXTURE_OFF_NICHE],
      screenedContentIds: [...FIXTURE_OFF_NICHE, "ev1"],
    }),
  "rakipsiz mod (kendi tutanlar, tekrarla yönü)": () => buildPlanDraft(planInput(ownOnly(), { competitors: [] })),
  "boş veri (ölçülemeyen sebepler)": () => buildPlanDraft(planInput([], { own: [], competitors: [] })),
  "yalnız ölçülemeyen lift": () => buildPlanDraft(planInput(rivalVideos("u", "noelle", 90, [undefined, undefined, undefined]))),
  "baz çizgisinin üstünde grup yok": () => buildPlanDraft(planInput(rivalVideos("w", "noelle", 90, [0.8, 0.7, 0.6]))),
};

describe("sebep metinleri kaynağında düz dil", () => {
  for (const [name, build] of Object.entries(SCENARIOS)) {
    it(`${name}: PANEL_JARGON ve çarpan rozeti yok`, () => {
      const draft = build();
      const texts = reasonTexts(draft.sections, draft.modeNote);
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text, text).not.toMatch(PANEL_JARGON);
        expect(text, text).not.toMatch(MULTIPLIER_BADGE);
        expect(text, text).not.toMatch(/\bslot|\bn=|medyan|niş dışı/i);
      }
    });
  }

  it("rakipli senaryoda yön ve kaçın gerekçeleri gerçekten üretilir (test boş geçmesin)", () => {
    const { sections } = SCENARIOS["sabit veri seti (rakipli, niş dışı hesap, kaçın)"]();
    expect(sections.focus.directions.length).toBeGreaterThan(0);
    expect(sections.avoid.entries.map((e) => e.kind)).toEqual(expect.arrayContaining(["low_lift", "off_niche"]));
    expect(sections.focus.directions[0].rationale).toMatch(/tipik video normalinin .* katı izlendi/);
  });
});
