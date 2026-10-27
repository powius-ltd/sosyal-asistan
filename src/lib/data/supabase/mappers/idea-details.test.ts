import { describe, expect, it } from "vitest";

import type { ScriptReview } from "@/lib/domain/intel";
import { IDEA_DETAILS_SCHEMA, toIdeaDetails } from "@/lib/data/supabase/mappers/idea-details";
import type { Json } from "@/lib/supabase/database.types";

const review: ScriptReview = {
  revised: true,
  originalScript: "Eski.",
  changes: ["Konuşma diline çevrildi"],
  claims: [{ text: "1453", verdict: "uncertain", note: "Kontrol et." }],
  corrections: 1,
  verifyBeforePublish: ['"1453" — Kontrol et.'],
  promptVersion: "script-review-v1",
};

describe("toIdeaDetails: scriptReview", () => {
  it("yazan ve okuyan aynı şema: gidiş dönüşte alan korunur", () => {
    const stored = IDEA_DETAILS_SCHEMA.parse({ script: "Yeni.", scriptReview: review });
    expect(toIdeaDetails(stored as unknown as Json).scriptReview).toEqual(review);
  });

  it("biçimsiz scriptReview atılır, diğer alanlar kalır", () => {
    const details = toIdeaDetails({ script: "Yeni.", scriptReview: { revised: "evet" } } as unknown as Json);
    expect(details).toEqual({ script: "Yeni." });
  });

  it("eski fikir (alan yok) etkilenmez", () => {
    expect(toIdeaDetails({ script: "Yeni." }).scriptReview).toBeUndefined();
  });
});
