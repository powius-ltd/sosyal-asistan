import { describe, expect, it } from "vitest";

import { checkCompliance } from "@/lib/compliance";
import { AI_DISCLOSURE_LINE, withAiDisclosure } from "@/lib/publish/ai-disclosure-line";

describe("withAiDisclosure", () => {
  it("beyan yoksa sona tek satır ekler ve uyum denetimi geçer", () => {
    const out = withAiDisclosure("Para kuralların kimin?\n#para");
    expect(out.endsWith(`\n\n${AI_DISCLOSURE_LINE}`)).toBe(true);
    expect(checkCompliance({ caption: out, isPaidPartnership: false, isAiGenerated: true, region: "TR" }).findings.map((f) => f.ruleId)).not.toContain("tr.ai-disclosure");
  });

  it("beyan zaten varsa açıklama değişmez (ikinci kez eklenmez)", () => {
    const caption = "Bir deneme. YZ ile üretildi.";
    expect(withAiDisclosure(caption)).toBe(caption);
    expect(withAiDisclosure(withAiDisclosure("x"))).toBe(withAiDisclosure("x"));
  });
});
