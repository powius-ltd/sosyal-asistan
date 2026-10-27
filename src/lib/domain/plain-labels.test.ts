/**
 * Müşteriye giden (ya da Analist'in okuyup müşteriye yazdığı) domain etiketleri düz dildir: panel jargonu, "Hook"/"CTA" ve çarpan rozeti yok
 * (Dalga 3½). Not: açı ve farkındalık katmanı etiketleri (`CREATIVE_ANGLE_LABEL`, `FUNNEL_STAGES`) etiketleme istemine (`label-angles`) girdiğinden
 * burada sınanmaz; ekran ve Analist düz karşılıklarını `lib/matrix/plain.ts`'ten okur.
 */
import { describe, expect, it } from "vitest";

import { ANATOMY_PHASE_LABEL, CTA_POSITION_LABEL, RECIPE_COHORT_LABEL, RECIPE_METRIC_LABEL, TEMPO_BUCKET_LABEL } from "@/lib/domain/anatomy";
import { CELL_STATUS_LABEL, PRIOR_FIT_LABEL } from "@/lib/domain/creative-matrix";
import { DATA_QUALITY_LABEL } from "@/lib/domain/insights";
import { MULTIPLIER_BADGE, PANEL_JARGON } from "@/lib/plain-language";

const TABLES: Record<string, Record<string, string>> = {
  ANATOMY_PHASE_LABEL,
  CTA_POSITION_LABEL,
  RECIPE_COHORT_LABEL,
  RECIPE_METRIC_LABEL,
  TEMPO_BUCKET_LABEL,
  CELL_STATUS_LABEL,
  PRIOR_FIT_LABEL,
  DATA_QUALITY_LABEL,
};

describe("domain etiketleri düz dil", () => {
  for (const [name, table] of Object.entries(TABLES)) {
    it(`${name}: jargon, Hook/CTA, niş ve çarpan rozeti yok`, () => {
      for (const [key, label] of Object.entries(table)) {
        expect(label, `${name}.${key}`).not.toMatch(PANEL_JARGON);
        expect(label, `${name}.${key}`).not.toMatch(/\bhook\b|\bCTA\b|niş|kesme\/dk/i);
        expect(label, `${name}.${key}`).not.toMatch(MULTIPLIER_BADGE);
        expect(label.trim(), `${name}.${key}`).not.toBe("");
      }
    });
  }
});
