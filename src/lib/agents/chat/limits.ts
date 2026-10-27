/**
 * Sohbet sınırları (SAF sabitler, bağımlılık yok): sunucu doğrulaması (`request.ts`) ve istemci (metin kutusu sınırı) AYNI sayıları kullanır;
 * istemci paketine zod girmesin diye sabitler şemadan ayrı durur.
 */

/** Soru uzunluğu üst sınırı (kod noktası). */
export const CHAT_QUESTION_MAX = 500;
/** Modele giden en çok geçmiş mesajı (son N). */
export const CHAT_HISTORY_KEEP = 6;
/** Geçmişteki tek mesajın kırpıldığı uzunluk (yanıtlar ≤ 700; soru ≤ `CHAT_QUESTION_MAX`). */
export const CHAT_HISTORY_TEXT_MAX = 700;
/** Gövde bayt üst sınırı: en büyük meşru gövde ≈ 24 × 700 + 500 karakter. */
export const CHAT_BODY_MAX_BYTES = 48_000;
