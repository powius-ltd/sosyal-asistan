import { describe, expect, it } from "vitest";

import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import { briefContextOf } from "@/lib/llm/creative-brief";
import { briefProblems, briefRatioTarget, finalizeBrief } from "@/lib/llm/creative-brief-validate";
import type { RawCreativeBrief } from "@/lib/llm/creative-brief-schema";

const ctx = briefContextOf(BRIEF_INPUT);
const problemsOf = (edit: (brief: RawCreativeBrief) => void, context = ctx): string[] => {
  const brief = validRawBrief();
  edit(brief);
  return briefProblems(brief, context);
};

describe("briefRatioTarget", () => {
  it("slotların ~%70'i uyarlama, en az bir deneme", () => {
    expect([3, 4, 5].map((n) => briefRatioTarget(n))).toEqual([
      { adapt: 2, test: 1 },
      { adapt: 3, test: 1 },
      { adapt: 4, test: 1 },
    ]);
  });
});

describe("briefProblems", () => {
  it("geçerli brif temiz; finalize oranı slotlardan sayar ve kanıt etiketini doldurur", () => {
    expect(briefProblems(validRawBrief(), ctx)).toEqual([]);
    const brief = finalizeBrief(validRawBrief(), ctx);
    expect(brief.ratio).toEqual({ adapt: 3, test: 1 });
    expect(brief.evidenceThin).toBe(false);
    expect(brief.slots[0].evidenceLabel).toBe("Verimlilik · soru");
    expect(brief.slots[2]).toMatchObject({ decision: "test", testValue: "soru ile açılış", evidenceLabel: "Seslenme" });
    expect(brief.slots[0]).not.toHaveProperty("testValue");
  });

  it("slot sayısı ve kimlikleri", () => {
    expect(problemsOf((b) => b.slots.pop()).join("\n")).toContain("slot sayısı 4 olmalı (3 var)");
    expect(problemsOf((b) => (b.slots[1].slotId = "S9")).join("\n")).toContain("2. slotun kimliği S2 olmalı");
  });

  it("oran: uyarlama hedefin ±1'i dışında ya da deneme yok", () => {
    const allAdapt = problemsOf((b) => {
      b.slots[2].decision = "adapt";
      delete b.slots[2].testValue;
      b.slots[2].evidenceRef = "topic:c1:question";
    });
    expect(allAdapt.join("\n")).toContain("en az bir deneme slotu");
    const allTest = problemsOf((b) => b.slots.forEach((s) => ((s.decision = "test"), (s.testValue = "x"))));
    expect(allTest.join("\n")).toContain("uyarlama slotu sayısı 3 ±1 olmalı (0 var)");
  });

  it("tek deneme değişkeni: deneme slotu değer taşır, uyarlama slotu taşımaz", () => {
    expect(problemsOf((b) => delete b.slots[2].testValue).join("\n")).toContain("S3: deneme slotunda testValue");
    expect(problemsOf((b) => (b.slots[0].testValue = "süre")).join("\n")).toContain("S1: uyarlama slotunda testValue olmamalı");
  });

  it("bilinmeyen ref ve kartlar yeterliyken yön ref'ine dayanan uyarlama", () => {
    expect(problemsOf((b) => (b.slots[0].evidenceRef = "topic:yok:x")).join("\n")).toContain('S1: evidenceRef girdide yok ("topic:yok:x")');
    expect(problemsOf((b) => (b.slots[0].evidenceRef = "F1")).join("\n")).toContain("S1: uyarlama slotu bir kart kimliğine dayanmalı");
  });

  it("kart azken (< 3) uyarlama yön ref'ine dayanabilir; brif 'kanıt az' işaretlenir", () => {
    const thin = briefContextOf({ ...BRIEF_INPUT, cards: BRIEF_INPUT.cards.slice(0, 1) });
    const raw = validRawBrief();
    raw.slots[1].evidenceRef = "F1";
    raw.slots[3].evidenceRef = "F1";
    expect(briefProblems(raw, thin)).toEqual([]);
    expect(finalizeBrief(raw, thin).evidenceThin).toBe(true);
  });

  it("sütun dağılımı: toplam, tanımsız sütun, slot sayımı uyuşmazlığı", () => {
    expect(problemsOf((b) => (b.pillars[0].slots = 3)).join("\n")).toContain("toplamı 4 olmalı (5 var)");
    expect(problemsOf((b) => (b.slots[0].pillar = "Gündem")).join("\n")).toContain('S1: sütun "Gündem" sütun listesinde yok');
    expect(problemsOf((b) => (b.slots[0].pillar = "Araçlar")).join("\n")).toContain('"Verimlilik" sütunu 2 slot diyor, slotlarda 1 var');
  });

  it("süreklilik geçen haftanın varlığını izler", () => {
    expect(problemsOf((b) => (b.continuity.mode = "first_week")).join("\n")).toContain("geçen hafta planı var");
    const first = briefContextOf({ ...BRIEF_INPUT, lastWeek: undefined });
    expect(problemsOf(() => {}, first).join("\n")).toContain("first_week olmalı");
  });

  it("düz dil: jargon, rakam, yüzde, sayı sözcüğü, süslü parantez, çok cümleli tema", () => {
    expect(problemsOf((b) => (b.slots[0].why = "Lift yüksek çıkmış.")).join("\n")).toContain("S1.why: panel jargonu var");
    expect(problemsOf((b) => (b.theme = "Bu hafta 3 araç anlatıyoruz.")).join("\n")).toContain("theme: belirteç dışı rakam");
    expect(problemsOf((b) => (b.continuity.note = "Yüzde olarak arttı.")).join("\n")).toContain("belirteç dışı sayı sözcüğü");
    expect(problemsOf((b) => (b.slots[1].why = "Bu {lift:x} işe yaradı.")).join("\n")).toContain("{ } kullanma");
    expect(problemsOf((b) => (b.theme = "Bir cümle. İkinci cümle.")).join("\n")).toContain("theme: tek cümle olmalı");
  });
});
