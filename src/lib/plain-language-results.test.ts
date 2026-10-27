import { describe, expect, it } from "vitest";

import { ANATOMY_PLAIN, CTA_POSITION_PLAIN, PHASE_PLAIN, RECIPE_COHORT_PLAIN, RECIPE_METRIC_PLAIN } from "@/lib/anatomy/plain";
import { CTA_POSITIONS } from "@/lib/domain/anatomy";
import { LIFT_TIER_MIN, type LiftTier } from "@/lib/domain/content";
import { CTA_TYPE_LABEL, CTA_TYPES, LABEL_AXIS_LABEL, SECTION_TYPE_LABEL } from "@/lib/domain/taxonomy";
import { ANGLE_MAP_PLAIN, MAP_DESCRIPTION_PLAIN, MAP_KIND_PLAIN, TOPIC_MAP_PLAIN, TOPIC_STATUS_LONG, TOPIC_STATUS_SHORT } from "@/lib/matrix/plain";
import * as MatrixPlain from "@/lib/matrix/plain";
import { PANEL_JARGON } from "@/lib/plain-language";
import * as Results from "@/lib/plain-language-results";
import { liftBadgeHint, liftBadgeLabel, LIFT_TIER_PLAIN, lowConfidenceHint, openingTypeLabel, timesText } from "@/lib/plain-language-results";
import { HOOK_TYPES } from "@/lib/domain/hook-types";

/** Bir sözlük nesnesindeki bütün metinleri (iç içe nesne, dizi, işlev sonucu olmayan) toplar. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value instanceof Map) for (const item of value.values()) strings(item, out);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) strings(item, out);
  return out;
}

/** Düz dil kuralı: bu ekranların sözlüğündeki hiçbir metin panel jargonu taşımaz. */
describe("düz dil sözlükleri panel jargonu taşımaz", () => {
  const dictionaries: Record<string, unknown> = { ...Results, ...MatrixPlain, ANATOMY_PLAIN, PHASE_PLAIN, CTA_POSITION_PLAIN, RECIPE_COHORT_PLAIN, RECIPE_METRIC_PLAIN };

  it.each(Object.entries(dictionaries))("%s", (_name, dictionary) => {
    for (const text of strings(dictionary)) expect(text, text).not.toMatch(PANEL_JARGON);
  });

  it("işlevlerin ürettiği cümleler de temiz", () => {
    const samples = [
      liftBadgeHint(3, 11_300),
      liftBadgeHint(0, undefined),
      liftBadgeLabel(4.6),
      lowConfidenceHint(4),
      lowConfidenceHint(undefined),
      Results.OUTLIERS_PLAIN.description(1),
      Results.OUTLIERS_PLAIN.description(3),
      Results.OPENINGS_PLAIN.total("19", "19"),
      Results.OPENINGS_PLAIN.stats.filterBy("Soru"),
      Results.COMPARISON_PLAIN.tableDescription("30", "İstanbul"),
      Results.COMPARISON_PLAIN.similar.count("3"),
      MatrixPlain.priorHint("aykiri", "proven_opportunity"),
      MatrixPlain.priorHint("birincil", "empty"),
      MatrixPlain.typicalPhrase(3.2),
      MatrixPlain.typicalPhrase(undefined),
      ANGLE_MAP_PLAIN.intro("30"),
      TOPIC_MAP_PLAIN.intro("30", true),
      ANATOMY_PLAIN.summary("30", "18", "5", "13", timesText(3), "4"),
      ANATOMY_PLAIN.recipe.description(timesText(3)),
    ];
    for (const text of samples) expect(text, text).not.toMatch(PANEL_JARGON);
  });
});

describe("lift ipuçları normalinin katı olarak konuşur", () => {
  it("kademe adları eşiklerden türer", () => {
    for (const tier of [1, 2, 3, 4] as LiftTier[]) expect(LIFT_TIER_PLAIN[tier]).toContain(timesText(LIFT_TIER_MIN[tier]));
    expect(LIFT_TIER_PLAIN[3]).toBe("Tutan (3 katı ve üstü)");
    expect(LIFT_TIER_PLAIN[4]).toBe("Çok tutan (5 katı ve üstü)");
  });

  it("rozet balonu normal izlenmeyi söyler; rozet adı ana sözlükteki cümleden", () => {
    expect(liftBadgeHint(3, 11_300)).toBe("Tutan (3 katı ve üstü) · normalde yaklaşık 11,3 B izleniyor");
    expect(liftBadgeLabel(4.6)).toBe("Normalinin 4,6 katı izlendi");
  });

  it("çarpan: tam sayı tam, değilse tek ondalık", () => {
    expect(timesText(3)).toBe("3 katı");
    expect(timesText(1.5)).toBe("1,5 katı");
  });
});

describe("taksonomi etiketleri (kaynakta düz dil)", () => {
  it("bölüm tipi, etiket ekseni ve CTA değer etiketleri panel jargonu taşımaz", () => {
    for (const text of [...Object.values(SECTION_TYPE_LABEL), ...Object.values(LABEL_AXIS_LABEL), ...Object.values(CTA_TYPE_LABEL)]) {
      expect(text, text).not.toMatch(PANEL_JARGON);
    }
    expect(SECTION_TYPE_LABEL.hook).toBe("Açılış");
    expect(LABEL_AXIS_LABEL.cta_type).toBe("İzleyiciden istenen şey");
  });

  it("her CTA türünün etiketi var ve 'CTA' / 'DM' kısaltması taşımaz", () => {
    for (const key of CTA_TYPES) expect(CTA_TYPE_LABEL[key], key).not.toMatch(/\bCTA\b|\bDM\b/);
  });

  it("çağrının yeri ve faz adları düz dil", () => {
    for (const key of CTA_POSITIONS) expect(CTA_POSITION_PLAIN[key].length).toBeGreaterThan(0);
    expect(PHASE_PLAIN.hook).toBe("Açılış");
  });
});

describe("açılış tarzı kısa adları", () => {
  it("her taksonomi anahtarının adı var ve jargon taşımaz; bilinmeyen anahtar okunur hale gelir", () => {
    for (const key of HOOK_TYPES) expect(openingTypeLabel(key), key).not.toMatch(PANEL_JARGON);
    expect(openingTypeLabel("pov")).toBe("Sahnenin içine alan");
    expect(openingTypeLabel("yeni_tarz")).toBe("Yeni tarz");
  });
});

describe("harita başlıkları", () => {
  it("'kreatif matris' yerine 'yaklaşım haritası'", () => {
    expect(ANGLE_MAP_PLAIN.title).toBe("Yaklaşım haritası");
    expect(TOPIC_MAP_PLAIN.title).toBe("Konu ve açılış haritası");
    expect(MAP_KIND_PLAIN.angle_funnel).not.toMatch(/matris|açı ×|farkındalık/i);
    expect(MAP_DESCRIPTION_PLAIN.topic_hook).not.toMatch(/hook/i);
  });

  it("her durumun kısa ve uzun adı var", () => {
    for (const status of Object.keys(TOPIC_STATUS_SHORT) as (keyof typeof TOPIC_STATUS_SHORT)[]) {
      expect(TOPIC_STATUS_SHORT[status].length).toBeGreaterThan(0);
      expect(TOPIC_STATUS_LONG[status].length).toBeGreaterThan(0);
    }
  });
});
