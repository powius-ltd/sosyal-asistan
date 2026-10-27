import type { ActionResult } from "@/lib/actions/result";

/** Sunucuya ulaşılamadığında (action fırlattığında) gösterilen varsayılan Türkçe mesaj. */
export const ACTION_UNREACHABLE_MESSAGE = "İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.";

/**
 * Server action'ı çağırır; ağ/sunucu erişimi kopmuşsa (action fırlatırsa) yakalar ve Türkçe bir hata sonucuna çevirir.
 * Böylece istemci yaprakları her zaman `ok` bakıp toast gösterir; işlenmemiş promise reddi olmaz. Bağlama özel mesaj
 * `failureMessage` ile verilir (ör. "Prompt hazırlanamadı…"); TÜM istemci action çağrıları bu yardımcıdan geçer.
 * (İstemci bileşenleri `lib/actions/result`'tan yalnız tip alır; bu yüzden hata nesnesi elle kurulur.)
 */
export async function callAction<T extends object>(
  run: () => Promise<ActionResult<T>>,
  failureMessage: string = ACTION_UNREACHABLE_MESSAGE,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, code: "unknown", message: failureMessage };
  }
}
