/**
 * TikTok aktörünün hata satırları → ortak hata biçimi ve erişim sınıfı.
 *
 * Aktör okuyamadığı hedef için veri yerine `{ url, input, error, errorCode }` satırı yazar (aktör belgesi "error codes", 2026-10-13):
 * `PROFILE_PRIVATE` (hesap gizli) · `NOT_FOUND` (hesap / etiket yok) · `PROFILE_EMPTY` (video yok ya da giriş duvarı) ·
 * `POST_NOT_FOUND_OR_PRIVATE`, `POST_SENSITIVE`, `FILTER_NO_PASS`, `INVALID_INPUT`, `INVALID_URLS` …
 * Gizli / bulunamayan hesap BAŞARISIZLIK DEĞİL, SINIRDIR: Instagram'daki sınıflara eşlenir (`private` | `not_found`), ısrar edilmez.
 *
 * Ortak ayrıştırıcı (`_shared/not-item.ts`) hata satırını `error` + `errorDescription` + `username` alanlarından okur ve toplu işte hangi
 * hesabın düştüğünü `(@ad)` ile bildirir; TikTok satırı bu biçime çevrilir (kod küçük harf, hesap `input` / `url`'den).
 */
import { asRecord, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";

function classify(code: string, description: string): string {
  if (/private/.test(code)) return code.startsWith("post") ? "not_found" : "private";
  if (/not_found|empty/.test(code)) return "not_found";
  // Kod tanınmadı: açıklamadan çıkarmayı dene.
  if (/private/.test(description)) return "private";
  if (/not found|does not exist|no such/.test(description)) return "not_found";
  return code;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Hata satırıysa kod (küçük harf; kod yoksa hata metni) ve açıklaması; değilse undefined. */
function errorOf(row: RawItem): { code: string; description: string } | undefined {
  const code = text(row.errorCode).toLowerCase();
  const description = text(row.error);
  if (code === "" && description === "") return undefined;
  return { code: code || description.toLowerCase(), description: code ? description : "" };
}

/**
 * Hata satırını ortak biçime çevirir (`error` = kod, `errorDescription` = aktör metni, `username` = hedef hesap); hata satırı değilse
 * satır OLDUĞU GİBİ döner. Hedef hesap `input` (kullanıcı adı ya da profil bağlantısı) ya da `url`'den okunur.
 */
export function toCommonErrorRow(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row) return raw;
  const found = errorOf(row);
  if (!found) return raw;
  const handle = normalizeHandle(text(row.input)) || normalizeHandle(text(row.url));
  return { error: found.code, ...(found.description ? { errorDescription: found.description } : {}), ...(handle ? { username: handle } : {}) };
}

/** Satırlardaki ilk hata satırının sınıfı (`private` | `not_found` | tanınmayan kod); hata satırı yoksa `undefined`. */
export function readAccessError(rows: readonly unknown[]): string | undefined {
  for (const raw of rows) {
    const row = asRecord(raw);
    const found = row ? errorOf(row) : undefined;
    if (found) return classify(found.code, found.description.toLowerCase());
  }
  return undefined;
}
