/**
 * TikTok kullanıcı adı normalizasyonu.
 *
 * `@Kahve.Yeri`, `KAHVE_YERI`, `https://www.tiktok.com/@Kahve.Yeri?lang=tr`, `tiktok.com/@kahve.yeri/`
 * → `kahve.yeri` / `kahve_yeri`. Geçersiz girdi (video bağlantısı, kısa paylaşım bağlantısı, başka platform, biçim dışı) → `""`;
 * çağıran `""`'yi geçersiz sayar.
 *
 * Kural (TikTok yardım merkezi "kullanıcı adını değiştirme"): harf, rakam, alt çizgi ve nokta; 2–24 karakter; nokta sonda olamaz.
 * Büyük/küçük harf ayırt edilmez (küçük harfe indirilir). Tire (`-`) TikTok'ta geçerli DEĞİLDİR (genel `HANDLE_PATTERN` izin verir).
 */

export const TIKTOK_HANDLE_PATTERN = /^(?=.{2,24}$)[a-z0-9._]*[a-z0-9_]$/;

/** Profil bağlantısı yalnız ana alan adında (`tiktok.com`, `www.`, `m.`); `vm.` / `vt.` kısa paylaşım bağlantıları kullanıcı adı taşımaz. */
const PROFILE_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TIKTOK_URL = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)*tiktok\.com)(?:\/([^?#]*))?(?:[?#].*)?$/i;
/** Şemalı bağlantı. Şemasız `kahve.yeri` bir kullanıcı adıdır (noktalı adlar geçerli), alan adı sayılmaz. */
const SCHEMED_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function finish(candidate: string): string {
  const handle = candidate.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return TIKTOK_HANDLE_PATTERN.test(handle) ? handle : "";
}

/** Ham girdi → normalize kullanıcı adı; geçersizse `""`. */
export function normalizeHandle(raw: string): string {
  if (typeof raw !== "string") return "";
  const input = raw.trim();
  if (input === "") return "";

  const url = TIKTOK_URL.exec(input);
  if (url) {
    if (!PROFILE_HOSTS.has(url[1].toLowerCase())) return "";
    const segments = (url[2] ?? "").split("/").filter(Boolean).map(safeDecode);
    // Profil bağlantısı tam olarak `/@ad`: `@` zorunlu (`/discover`, `/tag/…` profil değildir), devamı (`/video/…`) içerik bağlantısıdır.
    if (segments.length !== 1 || !segments[0].startsWith("@")) return "";
    return finish(segments[0]);
  }
  // Başka bir sitenin bağlantısı (instagram.com/x, youtube.com/…) TikTok kullanıcı adı DEĞİLDİR.
  if (SCHEMED_URL.test(input)) return "";
  // Bağlantı değilse yol/boşluk/sorgu içeremez (tek sondaki "/" hoşgörülür).
  if (/[\s\\?#]/.test(input) || /\/./.test(input)) return "";
  return finish(input);
}
