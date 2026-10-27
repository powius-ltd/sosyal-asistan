/**
 * Stüdyo videosu yayın satırı süzgeci (TEK kural): `publish` işinin okuduğu satırlarla halka okuyucusunun saydığı satırlar AYNI olmalı;
 * yoksa halka "gönderilecek var" der, iş hiçbir satıra bakmaz ve zincir boşa döner. Satır: `order_id` dolu, `siparis:` medyalı ve
 * çalışma alanının kendi hesabına (tutamaklı) bağlı.
 */
import "server-only";

import { ORDER_MEDIA_PREFIX } from "@/lib/order-media-path";
import { isPublishableAccount } from "@/lib/publish/publishable";

/** `publish` işinin ilerlettiği durumlar (`awaiting_approval` insanda; zincir dokunmaz). */
export const ORDER_PUBLISH_STATUSES = ["approved", "publishing", "ready"] as const;

export function isOrderPublishRow(
  row: { order_id: string | null; media_path: string | null; social_account_id: string },
  handleByAccountId: ReadonlyMap<string, string>,
): boolean {
  if (!row.order_id || !row.media_path?.startsWith(ORDER_MEDIA_PREFIX)) return false;
  return Boolean(handleByAccountId.get(row.social_account_id));
}

/** Sipariş bağı için AKTİF olmayan durumlar (DB kısmi benzersiz indeksi `publish_jobs_workspace_order_idx` ile aynı): bu satırlar siparişi "işlenmiş" saymaz. */
export const ORDER_INACTIVE_STATUSES = ["failed", "cancelled", "expired"] as const;

export const isActiveOrderStatus = (status: string): boolean => !(ORDER_INACTIVE_STATUSES as readonly string[]).includes(status);

/**
 * `order_return` taramasının siparişi YENİDEN açabildiği durumlar: yalnız düşen (`failed`) ve süresi dolan (`expired`). Kullanıcının iptal ettiği
 * (`cancelled`) sipariş kalıcı ret sayılır, geri GELMEZ (kullanıcı kararı, 2026-10-20). DB indeksi (`ORDER_INACTIVE_STATUSES`) iptalliyi serbest bırakır:
 * böylece "değiştir" akışı (`publish-replace`) yeni satır açabilir; kalıcı ret yalnız dönüş taramasındadır.
 */
export const ORDER_REOPEN_STATUSES = ["failed", "expired"] as const;

/** Sipariş bu durumdaki bir satırla "işlenmiş" sayılır mı (dönüş taraması yeniden açmaz). */
export const isHandledOrderStatus = (status: string): boolean => !(ORDER_REOPEN_STATUSES as readonly string[]).includes(status);

/**
 * "İşlenmiş" sipariş kümesi (TEK kural; `hasJobForOrder`, halka sayımı ve testler bunu kullanır): karar siparişin EN SON satırına (`created_at`) göre.
 * En son satır `failed`/`expired` ise sipariş yeniden açılır; değilse (iptal dahil) işlenmiş sayılır. Böylece "değiştir" akışında iptalli eski satır,
 * yeni satır düştükten sonra siparişi sonsuza dek kilitlemez; tek satırlık iptal ise kalıcı ret kalır. Aynı anda biten satırlarda (eşit zaman) biri bile
 * yeniden açılamaz durumdaysa sipariş işlenmiş sayılır (güvenli yön: çift satır açma).
 */
export function handledOrderIds(rows: readonly { order_id: string | null; status: string; created_at: string }[]): Set<string> {
  const latest = new Map<string, { at: number; handled: boolean }>();
  for (const row of rows) {
    if (!row.order_id) continue;
    const at = Date.parse(row.created_at);
    const handled = isHandledOrderStatus(row.status);
    const seen = latest.get(row.order_id);
    if (!seen || at > seen.at) latest.set(row.order_id, { at, handled });
    else if (at === seen.at && handled) seen.handled = true;
  }
  return new Set([...latest].filter(([, v]) => v.handled).map(([id]) => id));
}

/**
 * Fişin yayınlanacağı hesap (TEK kural): çalışma alanında yayına açık TAM BİR Instagram hesabı varsa o; birden çoksa (hangisi belirsiz) ya da
 * hiç yoksa undefined (`no_account`): yanlış hesaba yayın açılmaz.
 */
export function pickOrderAccountId(accounts: readonly { id: string; platform: string; connection: string }[], zernioKeyPresent: boolean): string | undefined {
  const eligible = accounts.filter((a) => a.platform === "instagram" && isPublishableAccount(a, zernioKeyPresent));
  return eligible.length === 1 ? eligible[0].id : undefined;
}
