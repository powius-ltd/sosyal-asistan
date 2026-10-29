/**
 * `.env.local` metni üzerinde SAF işlemler (dosyaya dokunmaz): değer doğrulama ve satırı değiştir / ekle / kaldır. Diğer satırlar ve
 * yorumlar AYNEN kalır; satır sonu stili (LF / CRLF) korunur. Değer hiçbir hata iletisine girmez.
 */

export type KeyValueCheck = { ok: true; value: string } | { ok: false; message: string };

/** Gerçek anahtarlar bu karakterlerle yazılır; satır sonu, boşluk, tırnak, `=`, `#`, `$`, ters eğik çizgi gibi bozucular reddedilir. */
const VALUE_PATTERN = /^[A-Za-z0-9_\-.~:+/]+$/;
export const KEY_VALUE_MIN = 8;
export const KEY_VALUE_MAX = 300;

export function validateKeyValue(raw: string): KeyValueCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, message: "Anahtarı yapıştır." };
  if (value.length < KEY_VALUE_MIN || value.length > KEY_VALUE_MAX) {
    return { ok: false, message: "Anahtar eksik ya da fazla uzun görünüyor. Baştan kopyalayıp tekrar yapıştır." };
  }
  if (!VALUE_PATTERN.test(value)) {
    return { ok: false, message: "Anahtarda boşluk, tırnak, satır sonu ya da = gibi geçersiz karakter var. Yalnız anahtarı kopyalayıp yapıştır." };
  }
  return { ok: true, value };
}

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function lineIsFor(line: string, name: string): boolean {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return match?.[1] === name;
}

/** `value` verilirse ilk eşleşen satırı değiştirir (yoksa sona ekler, tekrarlar silinir); `undefined` ise satırı kaldırır. */
export function upsertEnvText(text: string, name: string, value: string | undefined): string {
  if (!NAME_PATTERN.test(name)) throw new Error("Geçersiz ortam değişkeni adı.");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const out: string[] = [];
  let replaced = false;
  for (const line of lines) {
    if (!lineIsFor(line, name)) {
      out.push(line);
      continue;
    }
    if (value !== undefined && !replaced) {
      out.push(`${name}=${value}`);
      replaced = true;
    }
  }
  if (value !== undefined && !replaced) out.push(`${name}=${value}`);
  return out.length === 0 ? "" : out.join(eol) + eol;
}
