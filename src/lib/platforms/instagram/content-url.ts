/**
 * Instagram içerik bağlantısı. Kısa kod, sayısal medya kimliğinin base64url (`A–Z a–z 0–9 - _`)
 * gösterimidir; kısa kod yoksa kimlikten türetilir (`3983939388063538023` → `DdJy8QANttn`).
 * `/p/<kod>/` her medya türü için geçerlidir (reel'e yönlendirir).
 */
import type { NormalizedContent } from "@/lib/platforms/types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Ondalık rakam dizgisini 64 tabanına çevirir (BigInt kullanmadan; hedef ES2017). */
export function shortcodeFromMediaId(mediaId: string): string | undefined {
  // "1234_5678" biçiminde (medya_kullanıcı) gelirse yalnız medya kısmı.
  const digits = mediaId.split("_")[0]?.trim() ?? "";
  if (!/^\d{1,25}$/.test(digits)) return undefined;

  let number = digits.split("").map(Number);
  let code = "";
  while (number.length > 0) {
    let remainder = 0;
    const quotient: number[] = [];
    for (const digit of number) {
      const value = remainder * 10 + digit;
      const q = Math.floor(value / 64);
      remainder = value % 64;
      if (quotient.length > 0 || q > 0) quotient.push(q);
    }
    code = ALPHABET[remainder] + code;
    number = quotient;
  }
  return code === "" ? undefined : code;
}

/** Kısa kod (ya da kimlikten türetilen) ile herkese açık bağlantı. Kod türetilemezse hata fırlatır. */
export function contentUrl(c: Pick<NormalizedContent, "externalId" | "shortcode">): string {
  const code = c.shortcode?.trim() || shortcodeFromMediaId(c.externalId);
  if (!code) throw new Error("Instagram bağlantısı için kısa kod ya da sayısal medya kimliği gerekir.");
  return `https://www.instagram.com/p/${code}/`;
}
