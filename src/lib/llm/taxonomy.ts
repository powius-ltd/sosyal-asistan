/**
 * LLM tarafının sürümlü taksonomisi: zod enum'ları (şema/çıktı doğrulaması) ve prompt'a yazılacak değer listeleri. Değerlerin
 * kendisi `domain/**`'tadır (ekranlar da kullanır): hook türleri `domain/hook-types.ts`, bölüm tipi/etiket ekseni/çerçeve/CTA/
 * süre kovası `domain/taxonomy.ts`, sürüm `TAXONOMY_VERSION` (`domain/intel.ts`). Burada YENİ liste tanımlanmaz: prompt ve şema
 * her zaman domain'le aynı listeyi görür (liste değişirse sürüm artar; eski analizler eski sürümle okunur).
 *
 * Kural (rakip analiz kuralları): enum'lar versiyonlu taksonomiden gelir; model listenin dışında değer üretirse zod reddeder ve
 * sonuç geçersiz sayılır (sessizce kabul edilmez).
 */
import "server-only";

import { z } from "zod";

import { HOOK_TYPES, hookTypeLabel } from "@/lib/domain/hook-types";
import { EDIT_TEMPO_LABEL, HOOK_SOURCES, HOOK_SOURCE_LABEL, TAXONOMY_VERSION } from "@/lib/domain/intel";
import {
  CTA_TYPES,
  CTA_TYPE_LABEL,
  DURATION_BUCKETS,
  DURATION_BUCKET_LABEL,
  IDEA_FRAMES,
  IDEA_FRAME_LABEL,
  LABEL_AXES,
  LABEL_AXIS_LABEL,
  SECTION_TYPES,
  SECTION_TYPE_LABEL,
} from "@/lib/domain/taxonomy";

export { TAXONOMY_VERSION };

/** Sabit dizi → `z.enum` (zod tuple ister; listeler `readonly string[]` olarak tanımlı). */
function enumOf<T extends string>(values: readonly T[]): z.ZodEnum<{ [K in T]: K }> {
  return z.enum(values as unknown as readonly [T, ...T[]]) as unknown as z.ZodEnum<{ [K in T]: K }>;
}

export const hookTypeSchema = enumOf(HOOK_TYPES);
export const hookSourceSchema = enumOf(HOOK_SOURCES);
export const sectionTypeSchema = enumOf(SECTION_TYPES);
export const labelAxisSchema = enumOf(LABEL_AXES);
export const frameSchema = enumOf(IDEA_FRAMES);
export const ctaTypeSchema = enumOf(CTA_TYPES);
export const durationBucketSchema = enumOf(DURATION_BUCKETS);
export const editTempoSchema = enumOf(["slow", "medium", "fast"] as const);

/** Bu sürümün tüm listeleri tek nesnede (yeni sürüm = yeni nesne; eskisi okuma için korunur). */
export const TAXONOMY = {
  version: TAXONOMY_VERSION,
  hookTypes: HOOK_TYPES,
  hookSources: HOOK_SOURCES,
  sectionTypes: SECTION_TYPES,
  labelAxes: LABEL_AXES,
  frames: IDEA_FRAMES,
  ctaTypes: CTA_TYPES,
  durationBuckets: DURATION_BUCKETS,
} as const;

/** Anahtar biçimi için kalıp (prompt'ta "yalnız şu değerler" derken doğrulama): küçük harf + alt çizgi. */
export const TAXONOMY_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const isHookType = (value: string): boolean => HOOK_TYPES.includes(value);

/** Prompt'a yazılacak değer listesi: "question (Soru) | list (Liste) | …". Etiket Türkçe'dir; model anahtarı (ilk kelime) döndürür. */
function listOf(keys: readonly string[], label: (key: string) => string): string {
  return keys.map((key) => `${key} (${label(key)})`).join(" | ");
}

/** Prompt bloğu: her eksenin izinli değerleri. Şema ve prompt aynı listeyi kullanır (`TAXONOMY`). */
export function taxonomyPromptBlock(): string {
  return [
    `Taksonomi sürümü: ${TAXONOMY_VERSION}`,
    `hookType: ${listOf(HOOK_TYPES, hookTypeLabel)}`,
    `hookSource: ${listOf(HOOK_SOURCES, (k) => HOOK_SOURCE_LABEL[k as keyof typeof HOOK_SOURCE_LABEL])}`,
    `section.type: ${listOf(SECTION_TYPES, (k) => SECTION_TYPE_LABEL[k as keyof typeof SECTION_TYPE_LABEL])}`,
    `label.key: ${listOf(LABEL_AXES, (k) => LABEL_AXIS_LABEL[k as keyof typeof LABEL_AXIS_LABEL])}`,
    `frame: ${listOf(IDEA_FRAMES, (k) => IDEA_FRAME_LABEL[k as keyof typeof IDEA_FRAME_LABEL])}`,
    `ctaType: ${listOf(CTA_TYPES, (k) => CTA_TYPE_LABEL[k as keyof typeof CTA_TYPE_LABEL])}`,
    `durationBucket: ${listOf(DURATION_BUCKETS, (k) => DURATION_BUCKET_LABEL[k as keyof typeof DURATION_BUCKET_LABEL])}`,
    `editTempo: ${listOf(["slow", "medium", "fast"], (k) => EDIT_TEMPO_LABEL[k as keyof typeof EDIT_TEMPO_LABEL])}`,
  ].join("\n");
}
