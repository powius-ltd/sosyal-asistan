/**
 * Rakip kullanıcı adı ayıklama: "@Kahve.Yeri" ya da profil URL'sinden temiz handle çıkarır.
 * Aynı fonksiyon hem istemci önizlemesinde hem sunucu doğrulamasında kullanılır (saf, bağımlılıksız).
 *
 * Platform VERİLİRSE kesin kural modüldendir (`PlatformModule.publicData.normalizeHandle`: o platformun profil bağlantısı,
 * uzunluk ve karakter kuralı; başka platformun bağlantısı reddedilir). Platform verilmezse (henüz seçilmemiş girdi) genel
 * temizlik yapılır; kesin kuralı depo / çalışma alanı şeması platformla yeniden uygular.
 */
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import type { Platform } from "@/lib/domain/platform";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";

export type HandleParseError = "empty" | "invalid" | "not_profile_url";

export type HandleParseResult = { ok: true; handle: string } | { ok: false; reason: HandleParseError };

export const HANDLE_ERROR_MESSAGE: Record<HandleParseError, string> = {
  empty: "Kullanıcı adı ya da profil bağlantısı gir.",
  invalid: "Geçersiz kullanıcı adı: harf, rakam, nokta ve alt çizgi kullan; çok kısa ya da çok uzun olmasın.",
  not_profile_url: "Bu bağlantı bir profile ait görünmüyor. Profil bağlantısını ya da kullanıcı adını gir.",
};

/** Profil olmayan Instagram yolları (gönderi, reel, keşfet …). */
const RESERVED_FIRST_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "s",
  "about",
]);

/** Kullanıcı adının `@` ile başladığı platformlar (TikTok/YouTube profil bağlantıları). */
const AT_PREFIX_HOSTS = new Set(["tiktok.com", "youtube.com"]);

const URL_PATTERN = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(instagram\.com|tiktok\.com|youtube\.com)(?:\/(.*))?$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function finish(candidate: string): HandleParseResult {
  const handle = candidate.replace(/^@+/, "").toLowerCase();
  return HANDLE_PATTERN.test(handle) ? { ok: true, handle } : { ok: false, reason: "invalid" };
}

/** Bağlantıya benzeyen girdi (şema ya da yol içeriyor): modül reddederse "profil bağlantısı değil" denir. */
const LOOKS_LIKE_URL = /^[a-z][a-z0-9+.-]*:\/\/|\/./i;

/** Ham girdi → `{ ok, handle }` ya da neden geçersiz olduğu. `platform` verilirse o platformun modül kuralı uygulanır. */
export function parseHandle(raw: string, platform?: Platform): HandleParseResult {
  const input = raw.trim();
  if (input === "") return { ok: false, reason: "empty" };

  if (platform !== undefined && hasPlatformModule(platform)) {
    const handle = getPlatformModule(platform).publicData.normalizeHandle(input);
    if (handle !== "") return { ok: true, handle };
    return { ok: false, reason: LOOKS_LIKE_URL.test(input) ? "not_profile_url" : "invalid" };
  }

  const url = URL_PATTERN.exec(input);
  if (url) {
    const host = url[1].toLowerCase();
    const path = (url[2] ?? "").split(/[?#]/)[0];
    const first = safeDecode(path.split("/").filter(Boolean)[0] ?? "");
    if (first === "") return { ok: false, reason: "not_profile_url" };
    if (AT_PREFIX_HOSTS.has(host) && !first.startsWith("@")) return { ok: false, reason: "not_profile_url" };
    if (RESERVED_FIRST_SEGMENTS.has(first.toLowerCase())) return { ok: false, reason: "not_profile_url" };
    return finish(first);
  }

  // URL değilse yol/boşluk içeremez.
  if (/[\s/\\?#]/.test(input)) return { ok: false, reason: "invalid" };
  return finish(input);
}

/** Başarılıysa handle, değilse boş dizge (canlı önizleme için). */
export function normalizeHandle(raw: string, platform?: Platform): string {
  const result = parseHandle(raw, platform);
  return result.ok ? result.handle : "";
}

/** Kendi hesaplarından biri mi (aynı platform + aynı kullanıcı adı; büyük/küçük harf ayrımsız)? Rakip olarak eklenemez (D3-17). */
export function isOwnHandle(own: readonly { platform: Platform; handle: string }[], platform: Platform, handle: string): boolean {
  const wanted = handle.replace(/^@+/, "").toLowerCase();
  return own.some((account) => account.platform === platform && account.handle.replace(/^@+/, "").toLowerCase() === wanted);
}
