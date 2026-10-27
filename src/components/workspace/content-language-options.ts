import type { SelectOption } from "@/components/common/labeled-select";
import { CONTENT_LANGUAGE_LABEL, CONTENT_LANGUAGES, isContentLanguage, type ContentLanguage } from "@/lib/domain/content-language";

/** Açılır listede "ayarlanmadı" seçeneğinin değeri (Select boş dizgeyi seçim saymaz; sunucuya `null`/boş olarak gider). */
export const CONTENT_LANGUAGE_AUTO = "auto";

/** İçerik dili seçenekleri: "Otomatik" + desteklenen diller (ayar alanı ve çalışma alanı oluşturma formu ortak kullanır). */
export const CONTENT_LANGUAGE_OPTIONS: SelectOption[] = [
  { value: CONTENT_LANGUAGE_AUTO, label: "Otomatik" },
  ...CONTENT_LANGUAGES.map((value) => ({ value, label: CONTENT_LANGUAGE_LABEL[value] })),
];

/** Seçim değeri → ayar: "auto" ya da bilinmeyen değer = ayarlanmadı (`null`). */
export function contentLanguageOfSelect(value: string): ContentLanguage | null {
  return isContentLanguage(value) ? value : null;
}
