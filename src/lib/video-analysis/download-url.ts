/**
 * İndirme adresi denetimi (SSRF ve süresi dolmuş adres): video yalnız kayıtlı platform modüllerinin bildirdiği CDN alan adlarından
 * (`PlatformModule.mediaDownload.allowedDomains`; bugün Instagram: `*.cdninstagram.com`, `*.fbcdn.net`), yalnız `https:` ile, kimlik
 * bilgisiz ve varsayılan portla indirilir. Alan adı TAM SONEK eşleşmesiyle denetlenir (nokta sınırıyla):
 * `evil.cdninstagram.com.attacker.com` ve `notcdninstagram.com` reddedilir. Her yönlendirme adımında yeniden çağrılır.
 *
 * Süreli adresin bitiş zamanını alan adının sahibi olan modül okur (`readExpiry`; Instagram'da `oe`); geçmişteyse indirmeye hiç
 * başlanmaz. İndirme kuralı bildirmeyen platformun (video incelemesi olmayan) hiçbir adresi buradan geçmez.
 * Hata iletisine tam adres YAZILMAZ (imzalı adreste erişim belirteci vardır): yalnız alan adı.
 */
import "server-only";

import { parseOeExpiry } from "@/lib/platforms/instagram/media-download";
import { listPlatformModules } from "@/lib/platforms/registry";
import type { MediaDownloadPolicy } from "@/lib/platforms/types";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";

/** Geriye uyum: Instagram `oe` okuyucusu eski yolundan da erişilir (asıl yeri modül: `platforms/instagram/media-download.ts`). */
export { parseOeExpiry };

const policies = (): MediaDownloadPolicy[] => listPlatformModules().flatMap((module) => (module.mediaDownload ? [module.mediaDownload] : []));

/** Kayıtlı modüllerin izinli CDN alan adları (kayıt sırasıyla). */
export const ALLOWED_CDN_DOMAINS: readonly string[] = policies().flatMap((policy) => [...policy.allowedDomains]);

const matchesDomain = (host: string, domain: string): boolean => host.endsWith(`.${domain}`) && host.length > domain.length + 1;

/** `hostname`'in sahibi olan indirme kuralı (alt alan adı eşleşmesi: `x.cdninstagram.com`; yalnız `cdninstagram.com` değil). */
function policyOfHost(hostname: string): MediaDownloadPolicy | undefined {
  const host = hostname.toLowerCase();
  return policies().find((policy) => policy.allowedDomains.some((domain) => matchesDomain(host, domain)));
}

/** `host` izinli alan adlarından birinin ALT alan adı mı. */
export function isAllowedCdnHost(hostname: string): boolean {
  return policyOfHost(hostname) !== undefined;
}

/** Adresin bitiş zamanı (alan adının modülü okur); izinli olmayan alan adı ya da bitiş taşımayan adres → undefined. */
export function readDownloadExpiry(url: URL): Date | undefined {
  return policyOfHost(url.hostname)?.readExpiry(url);
}

/**
 * Adresi doğrular ve `URL` olarak döndürür; ihlalde `VideoAnalysisError` (`invalid_url` | `expired_url`). `base` verilirse göreli
 * adres (yönlendirme `Location` başlığı) buna göre çözülür.
 */
export function assertDownloadableUrl(raw: string | URL, now: Date, base?: URL): URL {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw, base);
  } catch {
    throw new VideoAnalysisError("invalid_url", "Video adresi geçersiz.");
  }
  if (url.protocol !== "https:") throw new VideoAnalysisError("invalid_url", "Video adresi yalnız https olabilir.");
  if (url.username !== "" || url.password !== "") throw new VideoAnalysisError("invalid_url", "Video adresinde kimlik bilgisi olamaz.");
  if (url.port !== "" && url.port !== "443") throw new VideoAnalysisError("invalid_url", "Video adresinde özel bağlantı noktası olamaz.");
  if (!isAllowedCdnHost(url.hostname)) {
    throw new VideoAnalysisError("invalid_url", `Video alan adı izinli değil (yalnız platformun kendi CDN'i): ${url.hostname}`);
  }
  const expiry = readDownloadExpiry(url);
  if (expiry !== undefined && expiry.getTime() <= now.getTime()) {
    throw new VideoAnalysisError("expired_url", `Video adresinin süresi dolmuş (bitiş: ${expiry.toISOString()}); yeni adres için veriyi yeniden topla.`);
  }
  return url;
}
