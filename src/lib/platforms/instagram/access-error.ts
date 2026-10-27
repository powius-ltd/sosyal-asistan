/**
 * Erişim hatası ayrıştırma: aktör "bu hesabı okuyamadım" dediğinde gizli hesap ya da bulunamayan
 * kullanıcı adı BAŞARISIZLIK DEĞİL, SINIRDIR — ısrar edilmez, sebebiyle bildirilir.
 * (Kaynak: `rakip analiz\src\mcp\reels.ts` `erisimHatasiOku`.)
 *
 * Dönüş (`ParseResult.accessError`):
 *  - "private"   → hesap gizli / kısıtlı (`private`, `restricted_page` …)
 *  - "not_found" → hesap yok ya da içerik yok (`not_found`, `no_items`, `empty …`)
 *  - başka metin → tanınmayan aktör hata kodu, olduğu gibi (küçük harf)
 */
import { asRecord } from "@/lib/platforms/_shared/field-pick";

function classify(code: string, description: string): string {
  if (/private|restricted/.test(code)) return "private";
  if (/not_found|no_items|empty/.test(code)) return "not_found";
  // Kod tanınmadı: açıklamadan çıkarmayı dene.
  if (/private|restricted/.test(description)) return "private";
  if (/not found|does not exist|no such/.test(description)) return "not_found";
  return code;
}

/** Satırlardaki ilk hata satırının sınıfı; hata satırı yoksa `undefined`. */
export function readAccessError(rows: readonly unknown[]): string | undefined {
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row || typeof row.error !== "string" || row.error.trim() === "") continue;
    const description = typeof row.errorDescription === "string" ? row.errorDescription : "";
    return classify(row.error.trim().toLowerCase(), description.toLowerCase());
  }
  return undefined;
}
