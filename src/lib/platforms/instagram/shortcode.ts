/**
 * Instagram içerik bağlantısı (URL) → kısa kod. `contentUrl` (content-url.ts) ters yönü yapar.
 *
 * Kabul edilen: `instagram.com` (+ `www.` / `m.`) üzerinde `/reel/<kod>`, `/reels/<kod>`, `/p/<kod>`; başa kullanıcı adı
 * gelebilir (`/<kullanici>/reel/<kod>/`); sorgu (`?igsh=…`) ve parça (`#…`) atılır; şema yoksa `https://` varsayılır.
 * Reddedilen: başka alan adı (`instagram.com.kotu.net`, `instagr.am`), http/https dışı şema (betik/veri/ftp), kimlik bilgili
 * adres (`kullanici:parola@`), `/stories/`, `/tv/`, `/share/…` (kısa kod içermeyen paylaşım yönlendirmeleri), profil bağlantıları.
 * Kısa kod büyük/küçük harf DUYARLIDIR (olduğu gibi döner).
 */
import type { ParsedContentUrl } from "@/lib/platforms/types";

/** Kısa kod biçimi: base64url (`A–Z a–z 0–9 - _`); gerçek kodlar 11 karakter, eski kodlar daha kısa olabilir. */
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,40}$/;
const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const KIND_BY_SEGMENT = new Map<string, ParsedContentUrl["kind"]>([
  ["reel", "reel"],
  ["reels", "reel"],
  ["p", "post"],
]);
/** Bağlantı üst sınırı: yapıştırılan metin kısa kalmalı (sınırsız girdiyi ayrıştırmayız). */
const URL_MAX_LENGTH = 500;

const RESERVED_FIRST_SEGMENTS = new Set(["share", "stories", "tv", "explore", "accounts", "direct", "s"]);

function kindOf(segment: string | undefined): ParsedContentUrl["kind"] | undefined {
  return segment === undefined ? undefined : KIND_BY_SEGMENT.get(segment.toLowerCase());
}

export function parseInstagramContentUrl(input: string): ParsedContentUrl | undefined {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "" || text.length > URL_MAX_LENGTH || /\s/.test(text)) return undefined;

  // Şemasız yapıştırma ("instagram.com/reel/…") yalnız bilinen alan adlarıyla başlıyorsa kabul edilir.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^(www\.|m\.)?instagram\.com\//i.test(text) ? `https://${text}` : undefined;
  if (withScheme === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return undefined;

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  // `/<kullanici>/reel/<kod>` biçiminde başa kullanıcı adı gelebilir: tür kelimesi ilk iki konumdan birinde aranır.
  const kindIndex = kindOf(segments[0]) ? 0 : kindOf(segments[1]) ? 1 : -1;
  const kind = kindIndex < 0 ? undefined : kindOf(segments[kindIndex]);
  if (kindIndex < 0 || kind === undefined) return undefined;
  // Başta kullanıcı adı yerine Instagram'ın kendi yolu varsa (`/share/reel/<paylaşım-kimliği>`) bu bir kısa kod değildir.
  if (kindIndex === 1 && RESERVED_FIRST_SEGMENTS.has(segments[0].toLowerCase())) return undefined;
  const shortcode = segments[kindIndex + 1];
  if (shortcode === undefined || !SHORTCODE_PATTERN.test(shortcode)) return undefined;
  // Kod'dan sonra fazladan yol parçası (ör. `/reel/<kod>/audio/`) bu bir içerik bağlantısı değildir.
  if (segments.length > kindIndex + 2) return undefined;
  return { platform: "instagram", shortcode, kind };
}
