/**
 * Toplu okuma/yazma yardımcıları: listeyi parçalara bölme ve sınırlı eşzamanlılıkla çalıştırma.
 * (İstek başına kimlik sayısı URL uzunluğunu, satır sayısı gövde boyutunu sınırlar; N+1 yerine parça başına tek istek.)
 */

/** `items`'ı en çok `size` elemanlı parçalara böler (sıra korunur). `size` pozitif tam sayı olmalı. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`Parça boyutu pozitif tam sayı olmalı: ${size}`);
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/**
 * `fn`'i her öğe için en çok `limit` eşzamanlı çalıştırır; sonuçlar girdi sırasıyla döner.
 * İlk hata sonucu reddeder (başlamış işler tamamlanır, yenisi başlamaz).
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`Eşzamanlılık pozitif tam sayı olmalı: ${limit}`);
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
