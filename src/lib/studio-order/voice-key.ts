/** Hesabın ses anahtarının ortam değişkeni adı: stüdyo slug'ı büyük harf, tire alt çizgi (`ornek-studyo` → `ELEVENLABS_API_KEY_ORNEK_STUDYO`). İşçi ve panel (anahtar ekranı) ortak kullanır. */
export function studioVoiceKeyName(studioSlug: string): string {
  return `ELEVENLABS_API_KEY_${studioSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}
