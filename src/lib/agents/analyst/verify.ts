/**
 * Analist çıktısının KOD doğrulaması (`LlmJsonRequest.review`: sorun varsa 1 düzeltme turu, sonra `invalid_output`). Ajan yalnız pakette
 * olanı anabilir; uydurma sayı kuruluş gereği engellenir:
 *  - kanıt ref'i pakette olmalı; eylem kimliği pakette olmalı; `next_step` maddesi eylem ister;
 *  - metindeki her sayı belirteçtir: bilinmeyen belirteç, belirteç dışı rakam/yüzde/çarpan/sayı sözcüğü, ölçülemeyen olgunun belirteci
 *    reddedilir; ref'li belirtecin konusu maddenin kanıtında olmalıdır (kanıtsız sayı yok);
 *  - belirteçler yerleştirildikten sonra metin sınırlarını aşmamalı.
 * Madde sayısı (1–5), alan biçimi ve katılık zod şemasındadır (`schema.ts`). Saf: veri okumaz, LLM çağırmaz.
 */
import type { AnalystItemOutput, AnalystOutput } from "@/lib/agents/analyst/schema";
import type { BriefingFacts } from "@/lib/agents/analyst/facts-types";
import { findTokens, replaceTokens, strayNumberProblems } from "@/lib/agents/analyst/tokens";
import { BRIEFING_BODY_MAX, BRIEFING_HEADLINE_MAX } from "@/lib/domain/briefing";
import { isBriefingRef } from "@/lib/domain/briefing-refs";

/** Düzeltme isteğinde listelenen en çok sorun (istem şişmesin). */
const PROBLEM_LIST_MAX = 10;

const FIELDS = [
  ["headline", BRIEFING_HEADLINE_MAX],
  ["body", BRIEFING_BODY_MAX],
] as const;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bir metnin sorunları; `placeable` = tüm belirteçleri bilinen ve ölçülmüş mü (yerleştirme güvenli mi). */
export function textProblems(text: string, field: string, evidence: ReadonlySet<string>, facts: BriefingFacts): { problems: string[]; placeable: boolean } {
  const problems: string[] = [];
  let placeable = true;
  for (const token of findTokens(text)) {
    const entry = facts.tokens.get(token.key);
    if (entry === undefined) {
      problems.push(`${field}: bilinmeyen belirteç ${token.raw} (yalnız paketteki olgular için belirteç yazılır)`);
      placeable = false;
    } else if (entry.value === undefined) {
      problems.push(`${field}: ${token.raw} ölçülemeyen bir değer (${entry.reason ?? "ölçülemedi"}); bu sayıyı kullanma`);
      placeable = false;
    } else if (entry.format === "lift" && new RegExp(`${escapeRegExp(token.raw)}\\s*kat`, "iu").test(text)) {
      problems.push(`${field}: ${token.raw} zaten çarpan ("2,3 katı") olarak yazılır; ardına "kat" ekleme`);
    } else if (entry.subject !== undefined && !evidence.has(entry.subject)) {
      problems.push(`${field}: ${token.raw} için kanıtta ${entry.subject} yok (belirtecin ref'ini evidence'a ekle)`);
    }
  }
  for (const problem of strayNumberProblems(text)) problems.push(`${field}: ${problem}`);
  return { problems, placeable };
}

function itemProblems(item: AnalystItemOutput, facts: BriefingFacts): string[] {
  const problems: string[] = [];
  const evidence = new Set(item.evidence);
  for (const ref of item.evidence) {
    if (!isBriefingRef(ref)) problems.push(`geçersiz kanıt ref'i "${ref}"`);
    else if (!facts.refs.has(ref)) problems.push(`kanıt ref'i pakette yok: ${ref}`);
  }
  if (item.actionId !== undefined && !facts.actions.has(item.actionId)) problems.push(`eylem kimliği pakette yok: "${item.actionId}"`);
  if (item.kind === "next_step" && item.actionId === undefined) problems.push("next_step maddesi actionId ister (açık eylem kimliği: open_video:REF, open_plan:REF, ... ya da facts.commands'tan)");

  for (const [field, max] of FIELDS) {
    const text = textProblems(item[field], field, evidence, facts);
    problems.push(...text.problems);
    // Yerleştirilmiş uzunluk yalnız tüm belirteçler yerleştirilebiliyorsa ölçülür (aksi halde zaten reddedildi).
    if (text.placeable && [...replaceTokens(item[field], facts.tokens)].length > max) problems.push(`${field}: belirteçler yerleştirilince ${max} karakteri aşıyor; kısalt`);
  }
  return problems;
}

/** Tüm sorunlar ("madde N: ..." önekli); [] = çıktı geçerli. */
export function verifyAnalystOutput(output: AnalystOutput, facts: BriefingFacts): string[] {
  return output.items.flatMap((item, index) => itemProblems(item, facts).map((problem) => `madde ${index + 1}: ${problem}`));
}

/** `LlmJsonRequest.review` biçimi: sorun yoksa undefined, varsa modele geri verilecek kısa metin. */
export function reviewAnalystOutput(output: AnalystOutput, facts: BriefingFacts): string | undefined {
  const problems = verifyAnalystOutput(output, facts);
  if (problems.length === 0) return undefined;
  const shown = problems.slice(0, PROBLEM_LIST_MAX).join("\n- ");
  const more = problems.length > PROBLEM_LIST_MAX ? `\n(+${problems.length - PROBLEM_LIST_MAX} sorun daha)` : "";
  return `- ${shown}${more}\nHer sayı {ad:konu} belirteci olmalı; rakam, yüzde, çarpan ("3x", "4 kat") ve sayı sözcüğü yazma. Ref'ler ve eylem kimlikleri paketten harfi harfine kopyalanmalı.`;
}
