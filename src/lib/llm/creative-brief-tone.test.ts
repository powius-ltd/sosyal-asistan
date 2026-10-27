import { describe, expect, it } from "vitest";

import { briefContextOf } from "@/lib/llm/creative-brief";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import type { RawCreativeBrief } from "@/lib/llm/creative-brief-schema";
import { briefProblems } from "@/lib/llm/creative-brief-validate";

const problemsOf = (edit: (brief: RawCreativeBrief) => void, mode: "own" | "rivals"): string =>
  (() => {
    const brief = validRawBrief();
    edit(brief);
    return briefProblems(brief, briefContextOf({ ...BRIEF_INPUT, mode })).join("\n");
  })();

describe("brif denetimi: rakipsiz hesapta rakip yok", () => {
  it("mod own + 'rakiplerde' → sorun; mod rivals → serbest", () => {
    const edit = (brief: RawCreativeBrief) => (brief.slots[1].why = "Doğrudan seslenen açılış rakiplerde işe yaramış.");
    expect(problemsOf(edit, "own")).toContain("S2.why: bu hesapta rakip verisi yok");
    expect(problemsOf(edit, "rivals")).not.toContain("rakip");
  });

  it("tema ve süreklilik notu da denetlenir", () => {
    expect(problemsOf((brief) => (brief.theme = "Bu hafta rakipleri geride bırakıyoruz."), "own")).toContain("theme: bu hesapta rakip verisi yok");
    expect(problemsOf((brief) => (brief.continuity.note = "Rakip serisinin devamı."), "own")).toContain("continuity.note");
  });

  it("geçerli brif own modda da temiz", () => {
    expect(problemsOf((brief) => (brief.slots[1].why = "Doğrudan seslenen açılış kendi videonda işe yaramış."), "own")).toBe("");
  });
});

describe("brif denetimi: güven dili", () => {
  it("düşük güvenli dayanak (F2) + 'bundan eminim' → sorun; yüksek güvenli kart (c1) serbest", () => {
    expect(problemsOf((brief) => (brief.slots[2].why = "Bundan eminim, bu açılış tutacak."), "rivals")).toContain("S3.why: dayanak güveni düşük");
    expect(problemsOf((brief) => (brief.slots[0].why = "Bundan eminim, bu konu tutmuş."), "rivals")).not.toContain("S1.why");
  });

  it("orta güvenli kartta (c2) 'kesinlikle' sorun", () => {
    expect(problemsOf((brief) => (brief.slots[1].why = "Kesinlikle işe yarar."), "rivals")).toContain("S2.why: dayanak güveni orta");
  });

  it("hiçbir slot yüksek güvene dayanmıyorsa genel metin de ölçülü olmalı", () => {
    const lowOnly = (brief: RawCreativeBrief) => {
      for (const slot of brief.slots) slot.evidenceRef = slot.decision === "adapt" ? "topic:c3:story" : "F2";
      brief.theme = "Bu haftanın kesin kazananı bu.";
    };
    expect(problemsOf(lowOnly, "rivals")).toContain("theme: dayanak güveni");
  });
});
