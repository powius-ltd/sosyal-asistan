/**
 * Video sürümü ↔ stüdyo sipariş kimliği (SPN-36; TEK yer, kapı ve dönüş bunu kullanır). Stüdyoya giden `siparis_id` sürümü taşır:
 * ilk sürüm `<taban>` (bugünkü gibi), sonrası `<taban>-r<n>`. Böylece her sürüm ayrı dosya olur ve eski dosyaya dokunulmaz.
 *
 * ELLE AYRIŞTIRMA YOK: bir kimliğin hangi sürüm olduğu kimlik metninden ("-r2" ekinden) çıkarılmaz (taban zaten `-r2` ile bitebilir: slot adı);
 * fişin `revisions[]` geçmişinden okunur. Bu dosya yalnız kimliği KURAR (`revisionOrderId`) ve kimliğin güncel mi eski mi olduğunu söyler.
 */
import type { StudioOrder } from "@/lib/domain/studio-order";

type OrderVersions = Pick<StudioOrder, "revision" | "revisions" | "ticket">;

/** `n`. sürümün sipariş kimliği: 1 → taban, sonrası `<taban>-r<n>`. SQL (`request_order_revision`) aynı kuralı uygular. */
export function revisionOrderId(baseId: string, revision: number): string {
  return revision <= 1 ? baseId : `${baseId}-r${revision}`;
}

/** İlk sürümün kimliği (taban): geçmişin ilk kaydı, yoksa fişin kimliği. */
export function baseOrderIdOf(order: Pick<StudioOrder, "revisions" | "ticket">): string {
  return order.revisions[0]?.orderId ?? order.ticket.siparis_id;
}

/** Fişin tüm sürüm kimlikleri (eski → güncel). */
export function orderVersionIds(order: OrderVersions): string[] {
  return [...order.revisions.map((r) => r.orderId), order.ticket.siparis_id];
}

/** Bu kimlik fişin ESKİ (revizeyle yerini yitirmiş) bir sürümü mü? Güncel sürüm ve yabancı kimlik için false. */
export function isSupersededOrderId(order: OrderVersions, orderId: string): boolean {
  return orderId !== order.ticket.siparis_id && order.revisions.some((r) => r.orderId === orderId);
}
