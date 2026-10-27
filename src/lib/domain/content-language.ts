/**
 * Hesabın İÇERİK dili: yayınlayacağı hook/script/açıklama taslağı hangi dilde yazılır. Panel metinleri (gerekçe, başlık) her zaman
 * Türkçedir; bu dil yalnız üretilen yayın içeriğini belirler. Çalışma alanı ayarı (`Workspace.contentLanguage`, NULL = otomatik) ve
 * çözüm sırası: `lib/workspace/content-language.ts`. DB kontrolü (`workspaces_content_language_check`) aynı listedir: yeni dil =
 * kontrol + istem kuralları (`lib/llm/content-language-rules.ts`) birlikte genişler.
 */

export const CONTENT_LANGUAGES = ["tr", "en"] as const;

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/** Ekranda görünen ad (ayar alanı, plan notu). */
export const CONTENT_LANGUAGE_LABEL: Record<ContentLanguage, string> = { tr: "Türkçe", en: "İngilizce" };

/** Tür koruyucu: ham metin (DB sütunu, form değeri) desteklenen bir dil mi. */
export function isContentLanguage(value: unknown): value is ContentLanguage {
  return CONTENT_LANGUAGES.some((language) => language === value);
}

/**
 * Dil kodunu ("en", "tr-TR", "EN_us") desteklenen bir içerik diline eşler; bilinmeyen/"und"/boş → undefined (sayılmaz).
 * Transcript dili (`transcripts.language`) bu biçimlerde gelebilir.
 */
export function toContentLanguage(code: string | undefined | null): ContentLanguage | undefined {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0];
  return isContentLanguage(primary) ? primary : undefined;
}
