/** Viral av satırları için ortak alan temizleyicileri (platformdan bağımsız). */

/** Açıklama üst sınırı (kod noktası; `viral_items.caption` check'iyle aynı). */
export const VIRAL_CAPTION_MAX = 500;
/** Bir videoda saklanan en çok etiket (`viral_items.hashtags` check'iyle aynı). */
export const VIRAL_HASHTAGS_MAX = 60;

/** Kod noktası bazlı kırpma (vekil çiftler bölünmez). */
export function clipCaption(caption: string | undefined): string | undefined {
  if (caption === undefined) return undefined;
  const text = caption.trim();
  if (text === "") return undefined;
  const points = [...text];
  return points.length <= VIRAL_CAPTION_MAX ? text : points.slice(0, VIRAL_CAPTION_MAX).join("");
}

/** Etiketler: `#` atılır, büyük/küçük harfe duyarsız tekilleştirilir, sınırlanır. */
export function cleanHashtags(listed: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of listed) {
    const clean = tag.trim().replace(/^#+/, "");
    const key = clean.toLowerCase();
    if (clean === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(clean);
    if (tags.length >= VIRAL_HASHTAGS_MAX) break;
  }
  return tags;
}
