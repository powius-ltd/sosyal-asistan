/**
 * Video revizesi girdileri ve `studio_orders.revisions` jsonb şeması (SPN-36): yazan SQL (`request_order_revision`) ve okuyan depo AYNI şemayı
 * kullanır. Revize notu tek satırlık düz metindir (boşluklar tek boşluğa iner): stüdyo fişine YAML değeri olarak yazıldığı için satır sonu taşımaz.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { ORDER_REVISION_NOTE_MAX, type OrderRevisionEntry } from "@/lib/domain/studio-order";
import type { Ticket } from "@/lib/studio-order/schema";

export const orderRevisionEntrySchema = z.strictObject({
  version: z.number().int().min(1),
  orderId: z.string().min(1),
  requestedAt: z.string().min(1),
  note: z.string().min(1),
  video: z.string().min(1).optional(),
  cover: z.string().min(1).optional(),
  publishJobId: z.string().min(1),
});

export const orderRevisionsSchema = z.array(orderRevisionEntrySchema);

export function parseOrderRevisions(raw: unknown): OrderRevisionEntry[] {
  return orderRevisionsSchema.parse(raw);
}

const noteSchema = z
  .string({ error: "Revize notu metin olmalı." })
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Revize notu boş olamaz.").max(ORDER_REVISION_NOTE_MAX, `Revize notu en fazla ${ORDER_REVISION_NOTE_MAX} karakter olabilir.`));

export function parseRevisionNote(input: unknown): string {
  return parseOrThrow(noteSchema, input, "Revize notu geçersiz.");
}

/**
 * Revizeden sonra fişin kendisi (mock; Supabase'te aynısını `request_order_revision` SQL'i yapar): yeni sürümün sipariş kimliği, `taslak` + onaysız,
 * stüdyonun yazdığı alanlar (video, kapak, hata notu) ve yayın izi temizlenir, `revize_notu` + `onceki_video` yazılır.
 */
export function revisedTicket(ticket: Ticket, input: { orderId: string; note: string }): Ticket {
  const rest: Ticket = { ...ticket };
  for (const key of ["video", "kapak", "hata_notu", "zernio_post_id", "yayin_url"] as const) delete rest[key];
  const video = ticket.video;
  return { ...rest, siparis_id: input.orderId, durum: "taslak", onay: false, revize_notu: input.note, ...(video !== undefined ? { onceki_video: video } : {}) };
}
