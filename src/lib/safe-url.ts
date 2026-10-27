/**
 * Dış bağlantı güvenliği: veri kaynağından (Apify/Meta/mock) gelen adres `href`'e körü körüne verilmez.
 * Yalnız `http:`/`https:` geçer; tehlikeli şemalar (script çalıştıranlar, `data:`), göreli yol ve bozuk adres → undefined.
 * `target="_blank"` ile açılan her bağlantı ayrıca `rel="noopener noreferrer"` taşır.
 */
export function safeExternalUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
