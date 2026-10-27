/**
 * İleri yönlü (imleçli) sayfalamada "Önceki sayfa" için iz: imleç opaktır (geri hesaplanamaz), bu yüzden geçilen sayfaların imleçleri
 * adreste `onceki` parametresiyle (tekrarlı) taşınır. Sayfa 1 imleçsizdir; sayfa 2'nin izi boştur; sayfa 3'ün izi [sayfa 2 imleci].
 * Saf yardımcılar: sunucu ve istemci ortak kullanır; Tutanlar ile Açılış kütüphanesi aynı kuralı kullanır.
 */
import type { RawSearchParams } from "@/lib/search-params";

export const TRAIL_PARAM = "onceki";
const TRAIL_MAX = 40;
const CURSOR_MAX = 200;

export interface PageTrail {
  /** Bu sayfanın imleci (ilk sayfada yok). */
  cursor?: string;
  /** Önceki sayfaların imleçleri (ilk sayfa hariç), eskiden yeniye. */
  trail: string[];
}

/** Adresten iz: bozuk / aşırı uzun değerler atılır. */
export function parseTrail(raw: RawSearchParams[string]): string[] {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return values.filter((value) => value.length > 0 && value.length <= CURSOR_MAX).slice(0, TRAIL_MAX);
}

/** Sonraki sayfa: bu sayfanın imleci ize eklenir. */
export function nextPage(current: PageTrail, nextCursor: string): PageTrail {
  return { cursor: nextCursor, trail: current.cursor === undefined ? current.trail : [...current.trail, current.cursor].slice(-TRAIL_MAX) };
}

/** Önceki sayfa; ilk sayfadaysa undefined. İlk sayfaya dönüş imleçsiz ve izsizdir. */
export function previousPage(current: PageTrail): PageTrail | undefined {
  if (current.cursor === undefined) return undefined;
  const last = current.trail.at(-1);
  return last === undefined ? { trail: [] } : { cursor: last, trail: current.trail.slice(0, -1) };
}

/** Sayfa bilgisini adres parametrelerine yazar. */
export function writePage(params: URLSearchParams, page: PageTrail, cursorParam = "cursor"): void {
  if (page.cursor !== undefined) params.set(cursorParam, page.cursor);
  for (const item of page.trail) params.append(TRAIL_PARAM, item);
}
