/**
 * Fiş girdileri: depo (mock ve Supabase) ile server action'lar AYNI katı şemayı kullanır (`manual-idea-input.ts` deseni). Panel yalnız YENİ
 * fiş yazar (`durum: taslak`, `onay: hayir`; SIPARIS v2); durum ilerlemesi stüdyonundur. Fiş, fikrin kimliğini taşıyorsa girdideki fikirle aynı olmalı.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { ORDER_KINDS, ticketSchema, type Ticket } from "@/lib/studio-order/schema";

type OrderKind = (typeof ORDER_KINDS)[number];

export const STUDIO_ORDER_NOTE_MAX = 4000;

const note = z.string({ error: "Fiş notu metin olmalı." }).trim().max(STUDIO_ORDER_NOTE_MAX, `Fiş notu en fazla ${STUDIO_ORDER_NOTE_MAX} karakter olabilir.`);
const weekStart = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hafta başı YYYY-AA-GG olmalı.");

export const createStudioOrderSchema = z
  .strictObject({
    ideaId: z.string({ error: "Fikir kimliği metin olmalı." }).trim().min(1, "Fikir kimliği boş olamaz."),
    ticket: ticketSchema,
    note: note.optional(),
    weekStart: weekStart.optional(),
    slot: z.number({ error: "Sıra sayı olmalı." }).int("Sıra tam sayı olmalı.").nonnegative("Sıra eksi olamaz.").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.ticket.durum !== "taslak" || v.ticket.onay !== false) ctx.addIssue({ code: "custom", path: ["ticket"], message: "Yeni fiş taslak ve onaysız olmalı." });
    if (v.ticket.fikir_id !== undefined && v.ticket.fikir_id !== v.ideaId) ctx.addIssue({ code: "custom", path: ["ticket", "fikir_id"], message: "Fişteki fikir kimliği girdiyle aynı olmalı." });
  });

export type CreateStudioOrderInput = z.input<typeof createStudioOrderSchema>;
export type ParsedCreateStudioOrder = { ideaId: string; ticket: Ticket; note: string; weekStart?: string; slot?: number };

export function parseCreateStudioOrder(input: unknown): ParsedCreateStudioOrder {
  const v = parseOrThrow(createStudioOrderSchema, input, "Fiş girdisi geçersiz.");
  return { ideaId: v.ideaId, ticket: v.ticket, note: v.note ?? "", weekStart: v.weekStart, slot: v.slot };
}

/** Taslak fişte değişebilen tek şey: üretim türü (`ticket.tur`) ve serbest not. */
export const updateStudioOrderSchema = z
  .strictObject({
    kind: z.enum(ORDER_KINDS, { error: "Bilinmeyen üretim türü." }).optional(),
    note: note.optional(),
  })
  .refine((v) => v.kind !== undefined || v.note !== undefined, { message: "Değiştirilecek bir alan verilmeli." });

export type UpdateStudioOrderInput = z.input<typeof updateStudioOrderSchema>;

export function parseUpdateStudioOrder(input: unknown): { kind?: OrderKind; note?: string } {
  return parseOrThrow(updateStudioOrderSchema, input, "Fiş değişikliği geçersiz.");
}

export const studioOrderQuerySchema = z.strictObject({
  ideaIds: z.array(z.string().min(1)).max(500, "En fazla 500 fikir sorgulanabilir.").optional(),
  weekStart: weekStart.optional(),
});
export type StudioOrderQuery = z.input<typeof studioOrderQuerySchema>;

export function parseStudioOrderQuery(input: unknown): StudioOrderQuery {
  return parseOrThrow(studioOrderQuerySchema, input ?? {}, "Fiş sorgusu geçersiz.");
}
