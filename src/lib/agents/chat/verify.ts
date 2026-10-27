/**
 * Sohbet yanıtının KOD doğrulaması (`LlmJsonRequest.review`: sorun varsa 1 düzeltme turu, sonra `invalid_output`). Brifingle AYNI kurallar
 * (`analyst/verify.textProblems`: bilinmeyen/ölçülemeyen belirteç, belirteç dışı rakam/yüzde/çarpan/sayı sözcüğü, belirtecin ref'i kanıtta) +
 * sohbete özgü olanlar:
 *  - `answer` en az bir kanıt ister ve her kanıt ref'i pakette olmalı (geçersiz/uydurma ref reddedilir);
 *  - `no_data` / `out_of_scope` sayı taşımaz (belirteç yok) ve kanıt göstermez;
 *  - komut/betik adı, bağlantı ve rakip alt yazısından alıntı (≥ `RIVAL_QUOTE_WORD_RUN` ardışık ortak kelime) yok;
 *  - belirteçler yerleştirilince metin `CHAT_TEXT_MAX`'ı aşmaz.
 * Yanıt ANCAK buradan geçerse kullanıcıya gösterilir. Saf: veri okumaz, LLM çağırmaz.
 */
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { findTokens, replaceTokens } from "@/lib/agents/analyst/tokens";
import { textProblems } from "@/lib/agents/analyst/verify";
import { CHAT_TEXT_MAX, type ChatOutput } from "@/lib/agents/chat/schema";
import { isBriefingRef } from "@/lib/domain/briefing-refs";
import { longestSharedWordRun } from "@/lib/intel/normalize";

/** Düzeltme isteğinde listelenen en çok sorun. */
const PROBLEM_LIST_MAX = 8;
/** Rakip alt yazısıyla bu kadar ardışık ortak kelime = alıntı (kopya engeli `normalize.ts` eşiği 8; sohbet için daha sıkı). */
export const RIVAL_QUOTE_WORD_RUN = 5;

/** Komut/betik adı ve bağlantı: sohbet komut göstermez, bağlantıyı kanıt ref'inden istemci türetir. */
const COMMAND_OR_LINK = /\b(?:npm|npx|pnpm|yarn)\b|\brun_cmd\b|\b(?:collect|analyze|label|plan|brief|measure)\s*:\s*now\b|https?:\/\/|\bwww\./i;

/** Pakette alt yazısı bulunan rakip videoları (alıntı denetimi için). */
function rivalCaptions(facts: BriefingFacts): string[] {
  return facts.pack.contents.flatMap((content) => (content.side === "rival" && typeof content.caption === "string" ? [content.caption] : []));
}

const TICKET_COMMANDS = ["select_idea", "write_ticket", "update_ticket"];

/** Fiş komutlarının şekil kuralları (kimliğin gerçekten var olması sunucuda `ticket-command.ts`'te denetlenir). */
function ticketProblems(output: ChatOutput): string[] {
  const { command, ticket } = output;
  if (command === undefined || !TICKET_COMMANDS.includes(command)) return ticket === undefined ? [] : ["ticket yalnız select_idea, write_ticket ya da update_ticket ile verilir"];
  if (ticket === undefined) return [`command "${command}" için ticket gerekir`];
  if (command === "select_idea" && (ticket.ideaId === undefined || ticket.kind !== undefined || ticket.note !== undefined || ticket.orderId !== undefined)) return ["select_idea yalnız ticket.ideaId ister"];
  if (command === "write_ticket" && (ticket.ideaId === undefined || ticket.orderId !== undefined)) return ["write_ticket ticket.ideaId ister (orderId yok)"];
  if (command === "update_ticket" && ticket.orderId === undefined && ticket.ideaId === undefined) return ["update_ticket ticket.orderId ya da ticket.ideaId ister"];
  if (command === "update_ticket" && ticket.kind === undefined && ticket.note === undefined) return ["update_ticket için kind ve/veya note gerekir"];
  return [];
}

/** Tüm sorunlar; [] = yanıt geçerli. */
export function verifyChatOutput(output: ChatOutput, facts: BriefingFacts): string[] {
  const problems: string[] = [];
  const isAnswer = output.kind === "answer";
  const evidence = new Set(output.evidence);
  if (output.command !== undefined && output.kind !== "out_of_scope") problems.push("command yalnız out_of_scope yanıtıyla verilir");
  if (output.command === "save_idea" && output.idea === undefined) problems.push('command "save_idea" için idea (title, note) gerekir');
  problems.push(...ticketProblems(output));
  if (output.command !== "save_idea" && output.idea !== undefined) problems.push('idea yalnız command "save_idea" ile verilir');

  if (isAnswer) {
    if (evidence.size === 0) problems.push("answer yanıtı en az bir kanıt ref'i ister (paketten harfi harfine)");
    for (const ref of evidence) {
      if (!isBriefingRef(ref)) problems.push(`geçersiz kanıt ref'i "${ref}"`);
      else if (!facts.refs.has(ref)) problems.push(`kanıt ref'i pakette yok: ${ref}`);
    }
  } else if (findTokens(output.text).length > 0) {
    problems.push(`${output.kind} yanıtında sayı belirteci olmaz (sayı vermiyorsun)`);
  }

  const text = textProblems(output.text, "text", isAnswer ? evidence : new Set<string>(), facts);
  problems.push(...text.problems);
  if (text.placeable && [...replaceTokens(output.text, facts.tokens)].length > CHAT_TEXT_MAX) problems.push(`text: belirteçler yerleştirilince ${CHAT_TEXT_MAX} karakteri aşıyor; kısalt`);

  if (COMMAND_OR_LINK.test(output.text)) problems.push("text: komut, betik adı ya da bağlantı yazma; kanıt bağlantısını sistem gösterir");
  if (rivalCaptions(facts).some((caption) => longestSharedWordRun(output.text, caption) >= RIVAL_QUOTE_WORD_RUN)) {
    problems.push("text: rakip alt yazısından alıntı var; kendi cümlenle anlat");
  }
  return problems;
}

/** `LlmJsonRequest.review` biçimi: sorun yoksa undefined, varsa modele geri verilecek kısa metin. */
export function reviewChatOutput(output: ChatOutput, facts: BriefingFacts): string | undefined {
  const problems = verifyChatOutput(output, facts);
  if (problems.length === 0) return undefined;
  const shown = problems.slice(0, PROBLEM_LIST_MAX).join("\n- ");
  const more = problems.length > PROBLEM_LIST_MAX ? `\n(+${problems.length - PROBLEM_LIST_MAX} sorun daha)` : "";
  return `- ${shown}${more}\nHer sayı {ad:konu} belirteci olmalı; rakam, yüzde, çarpan ("3x", "4 kat") ve sayı sözcüğü yazma. Ref'ler paketten harfi harfine kopyalanmalı.`;
}
