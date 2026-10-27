/**
 * Instagram kullanıcı adı normalizasyonu.
 *
 * `@Kahve.Yeri`, `KAHVE`, `https://www.instagram.com/Kahve.Yeri/?hl=tr`, `instagram.com/kahve/reels/`
 * → `kahve.yeri` / `kahve`. Geçersiz girdi (gönderi bağlantısı, başka platform, biçim dışı) → `""`;
 * çağıran `""`'yi geçersiz sayar. Karakter kümesi genel `HANDLE_PATTERN`'den (`lib/domain/competitor.ts`), uzunluk Instagram'ın kendi
 * sınırından gelir: en çok 30 karakter (genel desen 50'ye izin verir, bu yüzden Instagram için daha dardır).
 */
import { HANDLE_PATTERN } from "@/lib/domain/competitor";

/** Instagram kullanıcı adı en çok bu kadar karakter olabilir. */
export const INSTAGRAM_HANDLE_MAX_LENGTH = 30;

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
  "web",
  "developer",
]);

const INSTAGRAM_URL = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:instagram\.com|instagr\.am)(?:\/([^?#]*))?(?:[?#].*)?$/i;
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
  return handle.length <= INSTAGRAM_HANDLE_MAX_LENGTH && HANDLE_PATTERN.test(handle) ? handle : "";
}

/** Ham girdi → normalize kullanıcı adı; geçersizse `""`. */
export function normalizeHandle(raw: string): string {
  if (typeof raw !== "string") return "";
  const input = raw.trim();
  if (input === "") return "";

  const url = INSTAGRAM_URL.exec(input);
  if (url) {
    const first = safeDecode((url[1] ?? "").split("/").filter(Boolean)[0] ?? "");
    if (first === "" || RESERVED_FIRST_SEGMENTS.has(first.toLowerCase())) return "";
    return finish(first);
  }
  // Başka bir sitenin bağlantısı (tiktok.com/@x, youtube.com/…) Instagram kullanıcı adı DEĞİLDİR.
  if (SCHEMED_URL.test(input)) return "";
  // Bağlantı değilse yol/boşluk/sorgu içeremez (tek sondaki "/" hoşgörülür).
  if (/[\s\\?#]/.test(input) || /\/./.test(input)) return "";
  return finish(input);
}
