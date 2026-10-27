/**
 * Zernio anahtarı seçimi: çalışma alanı slug'ına özel `ZERNIO_API_KEY_<SLUG>`. Genel `ZERNIO_API_KEY` YALNIZ `GENERIC_KEY_WORKSPACE`
 * çalışma alanı için geçerlidir (bugünkü canlı kurulum); başka hesaba genel anahtar düşmez (bir hesabın verisi/videosu başka hesaba gitmesin).
 * Slug büyük harfe çevrilir, harf/rakam dışı her karakter `_` olur (`ornekstudyoapp` → `ORNEKSTUDYOAPP`, `ornek-hesap` → `ORNEK_HESAP`).
 * Anahtar DEĞERİ hiçbir yere yazılmaz; yalnız ortam değişkeninin adı döner.
 */

/** Genel anahtarın sahibi olan tek çalışma alanı. */
export const GENERIC_KEY_WORKSPACE = "ornekstudyoapp";

export interface ZernioKeyChoice {
  /** Seçilen ortam değişkeninin adı (değer değil). */
  envName: string;
  apiKey: string;
}

export function zernioKeyEnvName(slug: string | undefined): string | undefined {
  const suffix = slug?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return suffix ? `ZERNIO_API_KEY_${suffix}` : undefined;
}

/** Çalışma alanına özel anahtar; boşsa ve çalışma alanı `ornekstudyoapp` ise genel anahtar; yoksa undefined. */
export function pickZernioKey(slug: string | undefined, env: Readonly<Record<string, string | undefined>>): ZernioKeyChoice | undefined {
  const specific = zernioKeyEnvName(slug);
  const candidates = slug?.trim() === GENERIC_KEY_WORKSPACE ? [specific, "ZERNIO_API_KEY"] : [specific];
  for (const envName of candidates) {
    const apiKey = envName === undefined ? undefined : env[envName]?.trim();
    if (envName !== undefined && apiKey) return { envName, apiKey };
  }
  return undefined;
}
