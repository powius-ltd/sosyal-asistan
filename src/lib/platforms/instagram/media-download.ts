/**
 * Instagram video indirme kuralı (video incelemesi için GEÇİCİ indirme): yalnız Instagram'ın kendi CDN'i (`*.cdninstagram.com`,
 * `*.fbcdn.net`); adresler oturumsuz indirilebilir ve sürelidir. `oe` parametresi adresin bitiş zamanıdır (onaltılık unix saniyesi).
 */
import type { MediaDownloadPolicy } from "@/lib/platforms/types";

const OE_PATTERN = /^[0-9a-f]{1,8}$/i;

/** `oe` (onaltılık unix saniyesi) → bitiş zamanı; yok ya da okunamıyorsa undefined (bitiş bilinmiyor ≠ geçmiş). */
export function parseOeExpiry(url: URL): Date | undefined {
  const oe = url.searchParams.get("oe");
  if (oe === null || !OE_PATTERN.test(oe)) return undefined;
  return new Date(Number.parseInt(oe, 16) * 1000);
}

export const instagramMediaDownload: MediaDownloadPolicy = {
  allowedDomains: ["cdninstagram.com", "fbcdn.net"],
  readExpiry: parseOeExpiry,
};
