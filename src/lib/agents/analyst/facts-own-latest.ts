/**
 * Yayın tarihi olguları (saf): içeriğin yayından beri geçen günü ve kendi hesabın EN SON yayımlanan videosu. Tarih modele sayı olarak
 * değil belirteçle yazdırılır (`{ago:c:ID}` → "3 gün önce"); "son videom" sorusu yalnız `latest` işaretli olguya dayanır. Yayın tarihi
 * olmayan ya da gelecekteki (saat kayması) video ne yaşını verir ne de "son video" sayılır.
 */
import type { ContentItem } from "@/lib/domain/content";
import { DAY_MS } from "@/lib/time";

/** Yayından beri geçen tam gün; tarih yok/geçersiz/gelecekte → undefined. */
export function ageInDays(publishedAt: string | undefined, now: Date): number | undefined {
  if (publishedAt === undefined) return undefined;
  const publishedMs = Date.parse(publishedAt);
  if (!Number.isFinite(publishedMs) || publishedMs > now.getTime()) return undefined;
  return Math.floor((now.getTime() - publishedMs) / DAY_MS);
}

/** Kendi videolarından en son yayımlananı (eşitlikte kimlik); tarihli kendi video yoksa undefined. */
export function latestOwnContent(content: readonly ContentItem[], now: Date): ContentItem | undefined {
  let latest: { item: ContentItem; ms: number } | undefined;
  for (const item of content) {
    if (item.owner.kind !== "own" || ageInDays(item.publishedAt, now) === undefined) continue;
    const ms = Date.parse(item.publishedAt as string);
    if (latest === undefined || ms > latest.ms || (ms === latest.ms && item.id < latest.item.id)) latest = { item, ms };
  }
  return latest?.item;
}
