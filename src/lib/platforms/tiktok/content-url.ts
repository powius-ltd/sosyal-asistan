/**
 * TikTok içerik bağlantısı: kalıcı adres `https://www.tiktok.com/@<ad>/video/<kimlik>` (fotoğraf gönderisinde `/photo/<kimlik>`).
 * TikTok'ta ayrı bir "kısa kod" yoktur: `shortcode` = sayısal video kimliği (`content_items.shortcode` ile eşleşir).
 *
 * Kabul edilen: `tiktok.com` (+ `www.` / `m.`) üzerinde `/@<ad>/video/<kimlik>` ve `/@<ad>/photo/<kimlik>`; sorgu (`?lang=…`, `?is_from_webapp=…`)
 * ve parça atılır; şema yoksa `https://` varsayılır. Reddedilen: başka alan adı (`tiktok.com.kotu.net`), http/https dışı şema, kimlik bilgili
 * adres, profil bağlantısı, etiket/keşif yolları ve KISA PAYLAŞIM bağlantıları (`vm.tiktok.com/…`, `vt.tiktok.com/…`, `/t/…`): bunlar kimlik
 * taşımaz, çözmek için ağ isteği gerekir (yapılmaz); kullanıcıdan tam bağlantı istenir.
 */
import { safeExternalUrl } from "@/lib/safe-url";
import type { NormalizedContent, ParsedContentUrl } from "@/lib/platforms/types";

/** Video kimliği: yalnız rakam (bugünkü kimlikler 19 hane; eski kimlikler daha kısa olabilir). */
export const TIKTOK_VIDEO_ID_PATTERN = /^\d{8,25}$/;
const ALLOWED_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const KIND_BY_SEGMENT = new Map<string, ParsedContentUrl["kind"]>([
  ["video", "video"],
  ["photo", "post"],
]);
/** Bağlantı üst sınırı: yapıştırılan metin kısa kalmalı (sınırsız girdiyi ayrıştırmayız). */
const URL_MAX_LENGTH = 500;

/** Geçerli https TikTok içerik bağlantısından kimlik ve tür; değilse undefined. */
function parseUrl(url: URL): { id: string; kind: ParsedContentUrl["kind"] } | undefined {
  if (url.username !== "" || url.password !== "") return undefined;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return undefined;
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  // Tam olarak `/@<ad>/(video|photo)/<kimlik>`; `@` tek başına da gelebilir (`contentUrl`'in kullanıcı adsız biçimi).
  if (segments.length !== 3 || !segments[0].startsWith("@")) return undefined;
  const kind = KIND_BY_SEGMENT.get(segments[1].toLowerCase());
  if (kind === undefined || !TIKTOK_VIDEO_ID_PATTERN.test(segments[2])) return undefined;
  return { id: segments[2], kind };
}

export function parseTikTokContentUrl(input: string): ParsedContentUrl | undefined {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "" || text.length > URL_MAX_LENGTH || /\s/.test(text)) return undefined;

  // Şemasız yapıştırma ("tiktok.com/@ad/video/…") yalnız bilinen alan adlarıyla başlıyorsa kabul edilir.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^(www\.|m\.)?tiktok\.com\//i.test(text) ? `https://${text}` : undefined;
  if (withScheme === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const parsed = parseUrl(url);
  return parsed === undefined ? undefined : { platform: "tiktok", shortcode: parsed.id, kind: parsed.kind };
}

/**
 * Kimlikle herkese açık bağlantı. Kullanıcı adı bu imzada yoktur: `/@/video/<kimlik>` biçimi kullanılır (TikTok bunu sahibin adresine
 * yönlendirir; yönlendirme canlı DOĞRULANMADI). Toplanan içerikte `url` zaten aktörün verdiği tam kalıcı adrestir; bu yalnız yedektir.
 */
export function contentUrl(c: Pick<NormalizedContent, "externalId" | "shortcode">): string {
  const id = (c.shortcode?.trim() || c.externalId).trim();
  if (!TIKTOK_VIDEO_ID_PATTERN.test(id)) throw new Error("TikTok bağlantısı için sayısal video kimliği gerekir.");
  return `https://www.tiktok.com/@/video/${id}`;
}

/**
 * Kalıcı bağlantı → TikTok'un resmi gömülü oynatıcısı (`https://www.tiktok.com/player/v1/<kimlik>`; TikTok for Developers "Embed Player").
 * Yalnız https ve yalnız video (fotoğraf gönderisinin oynatıcısı yok); geçersiz/başka sunucu/kısa bağlantı → undefined.
 */
export function tiktokEmbedUrl(permalink: string | undefined | null): string | undefined {
  const safe = safeExternalUrl(permalink);
  if (!safe) return undefined;
  const url = new URL(safe);
  if (url.protocol !== "https:") return undefined;
  const parsed = parseUrl(url);
  return parsed?.kind === "video" ? `https://www.tiktok.com/player/v1/${parsed.id}` : undefined;
}
