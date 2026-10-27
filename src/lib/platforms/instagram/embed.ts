/**
 * Instagram resmi embed adresi. Kullanıcı kararı (docs/FAZ2-PLAN.md §8.7): kapak/video arayüzde YALNIZ Instagram'ın
 * resmi embed'iyle gösterilir; rakip CDN görseli/videosu (süreli adres) hiçbir yerde `<img>`/`<video>` ile kullanılmaz
 * ve gösterilmez. iframe kaynağı içeriğin herkese açık permalink'inden türetilir.
 */
import { safeExternalUrl } from "@/lib/safe-url";

/** Kabul edilen sunucu adları (tam eşleşme; alt alan adı ve benzeri sahte adres geçmez). */
const INSTAGRAM_HOSTS: readonly string[] = ["www.instagram.com", "instagram.com"];

/** `/reel/<kod>/`, `/reels/<kod>/`, `/p/<kod>/` ya da hesap önekli `/<hesap>/reel/<kod>/`. */
const PERMALINK_PATH = /^\/(?:[A-Za-z0-9._-]+\/)?(reel|reels|p)\/([A-Za-z0-9_-]{5,40})\/?$/;

/**
 * Permalink → `https://www.instagram.com/(reel|p)/<kod>/embed/`; geçersiz, https olmayan, başka sunucu ya da tanınmayan
 * yol → undefined (iframe hiç çizilmez). Sorgu/parça atılır; yalnız kabul edilen kalıptan üretilir.
 */
export function instagramEmbedUrl(permalink: string | undefined | null): string | undefined {
  const safe = safeExternalUrl(permalink);
  if (!safe) return undefined;
  const parsed = new URL(safe);
  if (parsed.protocol !== "https:" || !INSTAGRAM_HOSTS.includes(parsed.hostname)) return undefined;
  const match = PERMALINK_PATH.exec(parsed.pathname);
  if (!match) return undefined;
  const kind = match[1] === "p" ? "p" : "reel";
  return `https://www.instagram.com/${kind}/${match[2]}/embed/`;
}
