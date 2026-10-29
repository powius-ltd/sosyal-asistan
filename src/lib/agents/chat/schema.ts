/**
 * Sohbet LLM çıktı şeması (belirteçli, SON olmayan metin). Katı: bilinmeyen alan reddedilir; sayı/güven/bağlantı alanı YOK (sayı yalnız
 * metinde belirteç olarak yazılır ve kod yerleştirir, güveni kod hesaplar, bağlantıyı kanıt ref'inden istemci türetir). Brifingin
 * `analyst/schema.ts`'ine paraleldir ama tek yanıtlıdır: `kind` yanıtın türünü söyler.
 */
import { z } from "zod";

import { BRIEFING_EVIDENCE_MAX } from "@/lib/domain/briefing";
import { CHAT_ANSWER_KINDS } from "@/lib/agents/chat/events";
import { STUDIO_ORDER_NOTE_MAX } from "@/lib/data/studio-order-input";
import { manualIdeaSchema } from "@/lib/data/manual-idea-input";
import { ORDER_KINDS } from "@/lib/studio-order/schema";

/** Yanıt metni üst sınırı (belirteçler yerleştirilmiş hâliyle de geçerli): "kısa yanıt" kuralı. */
export const CHAT_TEXT_MAX = 700;

/** Fiş komutlarının hedefi (kimlikler YALNIZ `<workflow>` bloğundan kopyalanır; sunucu yine doğrular). */
export const CHAT_TICKET_SCHEMA = z.strictObject({
  ideaId: z.string().trim().min(1).max(128).optional().describe("id of an idea copied exactly from <workflow>.ideas"),
  orderId: z.string().trim().min(1).max(128).optional().describe("update_ticket only: id of a ticket copied exactly from <workflow>.tickets"),
  kind: z.enum(ORDER_KINDS).optional().describe("production kind: ugc | animasyon | broll | anlatim | karisik"),
  note: z.string().trim().min(1).max(STUDIO_ORDER_NOTE_MAX).optional().describe("the creator's own note for the ticket, in their words"),
});

/** Fikir düzeltme komutunun hedefi (kimlik YALNIZ `<workflow>` bloğundan; sunucu yine doğrular). */
export const CHAT_REVISION_SCHEMA = z.strictObject({
  ideaId: z.string().trim().min(1).max(128).describe("id of an idea copied exactly from <workflow>.ideas"),
  request: z.string().trim().min(1).max(500).describe("what the creator wants changed, in their own words"),
});

export const CHAT_COMMANDS = ["delegate", "save_idea", "select_idea", "write_ticket", "update_ticket", "revise_idea"] as const;

export const CHAT_OUTPUT_SCHEMA = z.strictObject({
  kind: z.enum(CHAT_ANSWER_KINDS).describe("answer = answered from the facts | no_data = the facts do not cover the question | out_of_scope = not about the account's data or asks to do something"),
  text: z
    .string()
    .trim()
    .min(1)
    .max(CHAT_TEXT_MAX)
    .describe("Short Turkish answer (at most four short sentences); numbers only as tokens like {lift:c:ID} or {g:followers}; no tokens in no_data/out_of_scope"),
  command: z
    .enum(CHAT_COMMANDS)
    .optional()
    .describe("delegate = the user asks you to DO one of the cycle's jobs (collect, analyse, label, plan, run the next step) · save_idea = the creator states a video idea of their own and wants it kept (also needs idea); select_idea / write_ticket / update_ticket = pick a plan idea / write its ticket / change a draft ticket (all need ticket) · revise_idea = rewrite the openings / outline / script of a plan idea as asked (needs revision); only with kind out_of_scope; omit otherwise"),
  idea: manualIdeaSchema
    .optional()
    .describe("only with command save_idea: title (short, in the creator's own words and language, at most 120 characters), note (the creator's own idea in their own words, at most 1000 characters), format only if the creator named one"),
  ticket: CHAT_TICKET_SCHEMA.optional().describe("only with select_idea (ideaId), write_ticket (ideaId, optional kind/note), update_ticket (orderId or ideaId, kind and/or note)"),
  revision: CHAT_REVISION_SCHEMA.optional().describe("only with revise_idea: ideaId and the creator's change request"),
  evidence: z
    .array(z.string())
    .max(BRIEFING_EVIDENCE_MAX)
    .describe("refs copied exactly from the facts (c:..., cell:..., topic:..., plan:..., idea:..., due:...); at least one when kind is answer; empty otherwise"),
});

export type ChatOutput = z.infer<typeof CHAT_OUTPUT_SCHEMA>;
export type ChatCommand = (typeof CHAT_COMMANDS)[number];
