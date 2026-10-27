/**
 * Video analizi taksonomi anahtarlarının (bölüm tipi, etiket ekseni ve değerleri) Türkçe görünen adları. Sözlükler TEK
 * yerde (`lib/domain/taxonomy.ts`, hook türleri `lib/domain/hook-types.ts`); burada yalnız "bilinmeyen anahtar" yedeği
 * vardır: taksonomi versiyonludur, yeni/eski değer ekranı bozmaz (`humanizeKey`). Eski analizlerdeki `value` bölümü
 * (taksonomi `2026-10-v1` öncesi) için ayrıca etiket tutulur.
 */
import { humanizeKey } from "@/lib/domain/hook-types";
import { CTA_TYPE_LABEL, IDEA_FRAME_LABEL, LABEL_AXIS_LABEL, SECTION_TYPE_LABEL } from "@/lib/domain/taxonomy";

/** Eski taksonomide olup `2026-10-v1`'de kalkmış bölüm tipleri. */
const LEGACY_SECTION_TYPE_LABEL = new Map<string, string>([["value", "Değer"]]);

// Domain sözlüğü (`lib/domain/taxonomy.ts`) zaten müşteri dilindedir ("Açılış", "İzleyiciden istenen şey"): ekranda ezme yok.
const SECTION_LABEL = new Map<string, string>(Object.entries(SECTION_TYPE_LABEL));
const AXIS_LABEL = new Map<string, string>(Object.entries(LABEL_AXIS_LABEL));

/** Değeri kapalı bir listeden gelen eksenlerin değer sözlükleri (`topic`/`tone` serbest metindir, çevrilmez). */
const AXIS_VALUE_LABEL = new Map<string, ReadonlyMap<string, string>>([
  ["frame", new Map<string, string>(Object.entries(IDEA_FRAME_LABEL))],
  ["cta_type", new Map<string, string>(Object.entries(CTA_TYPE_LABEL))],
]);

export function sectionTypeLabel(key: string): string {
  return SECTION_LABEL.get(key) ?? LEGACY_SECTION_TYPE_LABEL.get(key) ?? humanizeKey(key);
}

export function labelKeyLabel(key: string): string {
  return AXIS_LABEL.get(key) ?? humanizeKey(key);
}

/** Etiket değeri: `frame`/`cta_type` kapalı listeden Türkçe ad, diğer eksenlerde (konu, ton) model metni olduğu gibi. */
export function labelValueLabel(key: string, value: string): string {
  return AXIS_VALUE_LABEL.get(key)?.get(value) ?? value;
}
