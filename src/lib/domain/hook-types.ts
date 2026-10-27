/**
 * Hook türü etiketleri: taksonomi anahtarı → ekranda görünen Türkçe ad. TEK tablo; Fikirler kartı, video
 * analizi ve mock gerekçe metinleri bunu kullanır. Taksonomi versiyonludur (`TAXONOMY_VERSION`, `lib/llm/taxonomy.ts`):
 * bilinmeyen anahtar `humanizeKey` ile okunur hale getirilir, yeni taksonomi değeri ekranı bozmaz.
 * Anahtarlar (`question`, `shock_stat` …) veride olduğu gibi kalır; yalnız ekran etiketi çevrilir.
 *
 * `2026-10-v1`: ilk 8 tür Faz 0'dan; son 5 tür (`bold_claim` … `teaching_quote`) gerçek Instagram verisinden
 * (koçluk/maneviyat nişindeki konuşma açılışları) eklendi.
 */

const HOOK_TYPE_LABEL = new Map<string, string>([
  ["question", "Soru"],
  ["list", "Liste"],
  ["confession", "İtiraf"],
  ["shock_stat", "Şok istatistik"],
  ["pov", "POV"],
  ["mistake_warning", "Hata uyarısı"],
  ["comparison", "Karşılaştırma"],
  ["barrier_removal", "Engel kaldırma"],
  ["bold_claim", "Cesur iddia"],
  ["story_open", "Hikaye girişi"],
  ["callout", "Seslenme"],
  ["affirmation", "Olumlama"],
  ["teaching_quote", "Öğreti alıntısı"],
]);

/**
 * Hook türü anahtarı. Taksonomi versiyonlu olduğu için sözcük dağarcığı derleme zamanında kapalı bir birleşim DEĞİLDİR (eski/yeni
 * sürümün anahtarı `string` olarak okunur; `hookTypeLabel` bilinmeyeni insancıllaştırır): tip adı yalnız alanın ne olduğunu söyler.
 */
export type HookType = string;

/** Taksonomideki hook türü anahtarları (etiket tablosuyla aynı sıra). LLM şeması ve içgörü hesabı bunu kullanır. */
export const HOOK_TYPES: readonly HookType[] = [...HOOK_TYPE_LABEL.keys()];

/** "mistake_warning" → "Mistake warning" (bilinmeyen taksonomi anahtarı için yedek). */
export function humanizeKey(key: string): string {
  const spaced = key.replaceAll("_", " ").trim();
  return spaced.charAt(0).toLocaleUpperCase("tr-TR") + spaced.slice(1);
}

/** Hook türünün Türkçe adı. `Map` kullanılır: "constructor" gibi anahtarlar prototipten okunmaz. */
export function hookTypeLabel(key: string): string {
  return HOOK_TYPE_LABEL.get(key) ?? humanizeKey(key);
}
