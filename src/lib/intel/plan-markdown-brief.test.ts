import { describe, expect, it } from "vitest";

import { briefMarkdown } from "@/lib/intel/plan-markdown-brief";
import { BRIEF_INPUT, validRawBrief } from "@/lib/llm/creative-brief-fixtures";
import { briefContextOf } from "@/lib/llm/creative-brief";
import { finalizeBrief } from "@/lib/llm/creative-brief-validate";

describe("briefMarkdown", () => {
  const brief = finalizeBrief(validRawBrief(), briefContextOf(BRIEF_INPUT));
  const text = briefMarkdown(brief).join("\n");

  it("beş kararı ve her slotu yazar", () => {
    expect(text).toContain("## 0. Haftanın brifi");
    for (const label of ["**Tema:**", "**Sütunlar:**", "**Oran:** 3 kanıtlanmış fikir uyarlaması + 1 deneme", "**Bu haftanın denemesi", "**Süreklilik"]) expect(text).toContain(label);
    for (const id of ["S1", "S2", "S3", "S4"]) expect(text).toContain(`- ${id} · `);
  });

  it("kanıt azsa not düşer", () => {
    expect(text).not.toContain("Kanıt az");
    expect(briefMarkdown({ ...brief, evidenceThin: true }).join("\n")).toContain("Kanıt az");
  });

  it("kartsız brifte slot etiketi 'yönü uyarla', kartlıda 'kanıtlanmış fikri uyarla'; kanıt azken oran 'uyarlama' der", () => {
    expect(text).toContain("- S1 · kanıtlanmış fikri uyarla · ");
    const thin = { ...brief, evidenceThin: true, slots: brief.slots.map((slot) => (slot.decision === "adapt" ? { ...slot, evidenceRef: "F1", evidenceLabel: "60–90 sn" } : slot)) };
    const thinText = briefMarkdown(thin).join("\n");
    expect(thinText).toContain("- S1 · yönü uyarla · ");
    expect(thinText).not.toContain("S1 · kanıtlanmış");
    expect(thinText).toContain("**Oran:** 3 uyarlama + 1 deneme");
    expect(thinText).not.toContain("kanıtlanmış fikir uyarlaması");
  });
});
