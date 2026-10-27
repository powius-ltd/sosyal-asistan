/**
 * Metin eşleştirme yardımcıları (kanıt denetimi ve kopya engeli ortak kullanır): normalleştirme, kelime sayımı, en uzun ortak
 * kelime dizisi. Saf; LLM ve DB yok.
 *
 * Normalleştirme: Unicode NFKC (tam genişlikli harfler, bileşik karakterler, `…` → `...`) · sıfır genişlikli/yumuşak tire
 * karakterleri atılır · tipografik tırnaklar ve tire türleri düzleştirilir · `foldTurkish` (İ/ı duyarlı küçük harf, aksansız) ·
 * boşluklar tek boşluk. Noktalama silinMEZ: alıntı, korpusta birebir (bu normalleştirmeyle) geçmelidir.
 */
import { foldTurkish } from "@/lib/text";

/** Yatay/dikey görünmez karakterler: sıfır genişlikli boşluk/birleştirici, BOM, yumuşak tire. */
const INVISIBLE = /[​-‍⁠﻿­]/g;
const SINGLE_QUOTES = /[‘’‚‛′ʼ`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−]/g;

export function normalizeForMatch(text: string): string {
  const flat = text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-");
  return foldTurkish(flat).replace(/\s+/g, " ").trim();
}

/** Kelime: harf/rakam dizisi (içinde kesme işareti olabilir: "don't"). Noktalama ve yalnız-sembol parçalar kelime değildir. */
const WORD = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/** Normalleştirilmiş metnin kelimeleri. */
export function wordTokens(text: string): string[] {
  return normalizeForMatch(text).match(WORD) ?? [];
}

export function countWords(text: string): number {
  return wordTokens(text).length;
}

/**
 * İki metnin en uzun ORTAK ardışık kelime dizisinin uzunluğu (normalleştirilmiş kelimelerle). Kopya engeli bunu kullanır:
 * fikir/script metni rakip alıntısıyla ≥ 8 ardışık kelime paylaşıyorsa kopyadır. O(n·m), tek satırlık dizi.
 */
export function longestSharedWordRun(a: string, b: string): number {
  const x = wordTokens(a);
  const y = wordTokens(b);
  if (x.length === 0 || y.length === 0) return 0;
  let best = 0;
  let previous = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const current = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}
