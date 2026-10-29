/**
 * Fiş girdileri: depo (mock ve Supabase) ile server action'lar AYNI katı şemayı kullanır (`manual-idea-input.ts` deseni). Panel yalnız YENİ
 * fiş yazar (`durum: taslak`, `onay: hayir`; SIPARIS v2); durum ilerlemesi stüdyonundur. Fiş, fikrin kimliğini taşıyorsa girdideki fikirle aynı olmalı.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { ORDER_KINDS, ticketSchema, type OrderStatus, type Ticket } from "@/lib/studio-order/schema";

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

/**
 * Taslak fişte değişebilenler: üretim türü (`ticket.tur`), serbest not ve fikir metninden YENİDEN KURULAN fiş (`ticket`; SPN-35 G6: fikir
 * sohbetle düzeltilince taslak fiş eski metinle kalmasın). Yeniden kurulan fiş taslak ve onaysız olmalı; fikir kimliği depoda fişinkiyle eşlenir.
 */
export const updateStudioOrderSchema = z
  .strictObject({
    kind: z.enum(ORDER_KINDS, { error: "Bilinmeyen üretim türü." }).optional(),
    note: note.optional(),
    ticket: ticketSchema.optional(),
  })
  .refine((v) => v.kind !== undefined || v.note !== undefined || v.ticket !== undefined, { message: "Değiştirilecek bir alan verilmeli." })
  .superRefine((v, ctx) => {
    if (v.ticket !== undefined && (v.ticket.durum !== "taslak" || v.ticket.onay !== false)) ctx.addIssue({ code: "custom", path: ["ticket"], message: "Yenilenen fiş taslak ve onaysız olmalı." });
  });

export type UpdateStudioOrderInput = z.input<typeof updateStudioOrderSchema>;

export function parseUpdateStudioOrder(input: unknown): { kind?: OrderKind; note?: string; ticket?: Ticket } {
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

/**
 * Fişin durumunu ilerletir (SPN-33): üretime gönderme (`uretiliyor` + onay), stüdyodan dönüş (`uretildi` + video) ya da hata (`hata` + tek
 * cümle not). Sunucu işi (gönderme kapısı ve dönüş) çağırır; ekran doğrudan çağırmaz. Geçişler `advanceStudioOrderProblem` ile TEK yerde denetlenir.
 */
export const ADVANCE_ORDER_STATUSES = ["uretiliyor", "uretildi", "hata"] as const;
export type AdvanceOrderStatus = (typeof ADVANCE_ORDER_STATUSES)[number];

export const advanceStudioOrderSchema = z
  .strictObject({
    status: z.enum(ADVANCE_ORDER_STATUSES, { error: "Bilinmeyen fiş durumu." }),
    video: z.string().trim().min(1).optional(),
    cover: z.string().trim().min(1).optional(),
    errorNote: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "uretildi" && v.video === undefined) ctx.addIssue({ code: "custom", path: ["video"], message: "Üretildi durumu video ister." });
    if (v.status === "hata" && v.errorNote === undefined) ctx.addIssue({ code: "custom", path: ["errorNote"], message: "Hata durumu hata notu ister." });
    if (v.status !== "uretildi" && (v.video !== undefined || v.cover !== undefined)) ctx.addIssue({ code: "custom", path: ["video"], message: "Video yalnız üretildi durumunda yazılır." });
    if (v.status !== "hata" && v.errorNote !== undefined) ctx.addIssue({ code: "custom", path: ["errorNote"], message: "Hata notu yalnız hata durumunda yazılır." });
  });

export type AdvanceStudioOrderInput = z.input<typeof advanceStudioOrderSchema>;
export type ParsedAdvance = { status: AdvanceOrderStatus; video?: string; cover?: string; errorNote?: string };

export function parseAdvanceStudioOrder(input: unknown): ParsedAdvance {
  return parseOrThrow(advanceStudioOrderSchema, input, "Fiş durumu geçersiz.");
}

/** Geçiş kuralı: taslak → uretiliyor | uretildi | hata; uretiliyor → uretildi | hata; aynı duruma tekrar yazmak sorun değil. Başka geçiş yok. */
export function advanceStudioOrderProblem(from: OrderStatus, to: AdvanceOrderStatus): string | undefined {
  if (from === to || from === "taslak") return undefined;
  if (from === "uretiliyor" && (to === "uretildi" || to === "hata")) return undefined;
  return "Fişin durumu bu geçişe uygun değil.";
}

/** Geçişin fişe yazdığı alanlar (TEK yer: mock ve Supabase aynı sonucu üretir). `uretiliyor` ve `uretildi` fişi onaylı yapar. */
export function applyAdvance(ticket: Ticket, patch: ParsedAdvance): Ticket {
  const next: Ticket = { ...ticket, durum: patch.status };
  if (patch.status === "uretiliyor") next.onay = true;
  if (patch.status === "uretildi") {
    next.onay = true;
    if (patch.video !== undefined) next.video = patch.video;
    if (patch.cover !== undefined) next.kapak = patch.cover;
    delete next.hata_notu;
  }
  if (patch.status === "hata" && patch.errorNote !== undefined) next.hata_notu = patch.errorNote;
  return next;
}
