import { describe, expect, it } from "vitest";

import { CREATIVE_LABEL_FIELDS, creativeLabelRowSchema } from "@/lib/data/creative-label-schema";

const fields = { angle: "kimlik", funnel_stage: "sicak-musteri", angle_evidence: "alıntı", funnel_evidence: "alıntı" };
const row = { ...fields, content_item_id: "c1", workspace_id: "w1", evidence_verified: true, prompt_version: "label-angles-v1" };

describe("creative-label-schema", () => {
  it("taksonomi dışı açı/katman reddedilir", () => {
    expect(CREATIVE_LABEL_FIELDS.safeParse(fields).success).toBe(true);
    expect(CREATIVE_LABEL_FIELDS.safeParse({ ...fields, angle: "ornekmarka" }).success).toBe(false);
    expect(CREATIVE_LABEL_FIELDS.safeParse({ ...fields, funnel_stage: "bilinmiyor" }).success).toBe(false);
  });

  it("alıntı boş olamaz, 300 kod noktası sınırdır (DB char_length ile aynı: emoji tek sayılır)", () => {
    const quote = (value: string) => CREATIVE_LABEL_FIELDS.safeParse({ ...fields, angle_evidence: value }).success;
    expect(quote("   ")).toBe(false);
    expect(quote("a".repeat(300))).toBe(true);
    expect(quote("a".repeat(301))).toBe(false);
    expect(quote("😀".repeat(300))).toBe(true);
  });

  it("DB satırı: doğrulama sonucu açık yazılır; model/koşu boş olabilir", () => {
    expect(creativeLabelRowSchema.safeParse(row).success).toBe(true);
    expect(creativeLabelRowSchema.safeParse({ ...row, model: null, run_id: null }).success).toBe(true);
    const { evidence_verified, ...noVerdict } = row;
    expect(evidence_verified).toBe(true);
    expect(creativeLabelRowSchema.safeParse(noVerdict).success).toBe(false);
    expect(creativeLabelRowSchema.safeParse({ ...row, prompt_version: " " }).success).toBe(false);
  });
});
