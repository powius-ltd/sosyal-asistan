import { describe, expect, it } from "vitest";

import { HOOK_TYPES } from "@/lib/domain/hook-types";
import { TAXONOMY_VERSION as DOMAIN_VERSION } from "@/lib/domain/intel";
import {
  ctaTypeSchema,
  durationBucketSchema,
  frameSchema,
  hookSourceSchema,
  hookTypeSchema,
  isHookType,
  labelAxisSchema,
  sectionTypeSchema,
  TAXONOMY,
  TAXONOMY_KEY_PATTERN,
  TAXONOMY_VERSION,
  taxonomyPromptBlock,
} from "@/lib/llm/taxonomy";

describe("sürümlü taksonomi", () => {
  it("sürüm domain'dekiyle aynı: 2026-10-v1", () => {
    expect(TAXONOMY_VERSION).toBe("2026-10-v1");
    expect(TAXONOMY_VERSION).toBe(DOMAIN_VERSION);
    expect(TAXONOMY.version).toBe(TAXONOMY_VERSION);
  });

  it("zod enum'ları domain listeleriyle birebir (prompt ve şema aynı listeyi görür)", () => {
    expect(hookTypeSchema.options).toEqual([...HOOK_TYPES]);
    expect(hookTypeSchema.options).toHaveLength(13);
    expect(sectionTypeSchema.options).toEqual(["hook", "story", "problem", "insight", "proof", "practice", "cta"]);
    expect(labelAxisSchema.options).toEqual(["topic", "tone", "frame", "cta_type"]);
    expect(frameSchema.options).toEqual(["faith", "science", "personal", "practical"]);
    expect(hookSourceSchema.options).toEqual(["speech", "screen_text", "caption"]);
    expect(ctaTypeSchema.options).toContain("comment_keyword");
    expect(durationBucketSchema.options).toContain("over_90");
  });

  it("listenin dışındaki değer reddedilir (sessizce kabul edilmez)", () => {
    expect(hookTypeSchema.safeParse("bold_claim").success).toBe(true);
    expect(hookTypeSchema.safeParse("curiosity_gap").success).toBe(false);
    expect(sectionTypeSchema.safeParse("value").success).toBe(false);
    expect(frameSchema.safeParse("Faith").success).toBe(false);
  });

  it("tüm anahtarlar küçük harf + alt çizgi biçiminde (prompt'ta tek kelime)", () => {
    for (const key of [...TAXONOMY.hookTypes, ...TAXONOMY.sectionTypes, ...TAXONOMY.ctaTypes, ...TAXONOMY.durationBuckets.filter((k) => !/^\d/.test(k))]) {
      expect(TAXONOMY_KEY_PATTERN.test(key), key).toBe(true);
    }
  });

  it("isHookType", () => {
    expect(isHookType("teaching_quote")).toBe(true);
    expect(isHookType("constructor")).toBe(false);
  });

  it("prompt bloğu sürümü ve her eksenin değerlerini (anahtar + Türkçe etiket) içerir", () => {
    const block = taxonomyPromptBlock();
    expect(block).toContain("Taksonomi sürümü: 2026-10-v1");
    expect(block).toContain("bold_claim (Cesur iddia)");
    expect(block).toContain("screen_text (Ekran yazısı)");
    expect(block).toContain("comment_keyword (Yorum anahtar kelimesi)");
    expect(block.split("\n")).toHaveLength(9);
  });
});
