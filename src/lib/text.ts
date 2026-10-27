/**
 * Metin yardımcıları — tek yer. Kısaltma kod noktası bazındadır (emoji ikiye bölünmez) ve boşlukları tek
 * boşluğa indirir; liste başlıkları, yayın önizlemeleri ve fikir kanıt özeti aynı fonksiyonu kullanır.
 * `foldTurkish`: arama ve eşleştirme için Türkçe İ/ı duyarlı katlama (uyum denetimi, arama, ad benzersizliği).
 */

/**
 * Karşılaştırma için katlar: küçük harf (tr-TR: "İ"→"i", "I"→"ı"), aksanlar atılır (ş→s, ğ→g, ü→u, ö→o, ç→c, â→a),
 * dotless ı → i. "TANITIM" = "TANİTİM" = "Tanıtım" = "tanitim". JS varsayılan `toLowerCase()` "İ"yi birleşik noktalı
 * "i̇" yapar; bu yüzden tr-TR. Görüntüleme için KULLANILMAZ (yalnız karşılaştırma anahtarı).
 */
export function foldTurkish(text: string): string {
  return text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("ı", "i");
}

/**
 * Boşlukları (satır sonları dahil) tek boşluğa indirir; `max` kod noktasını aşarsa "…" ile keser (toplam ≤ `max`).
 * `max` < 2 ise yalnız "…" değil ilk karakter + "…" korunur.
 */
export function truncateText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, Math.max(max - 1, 1)).join("").trimEnd()}…`;
}
