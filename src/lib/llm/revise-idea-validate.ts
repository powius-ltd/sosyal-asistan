/**
 * `revise-idea` KOD DOĞRULAMASI (SPN-35): modelin yeniden yazdığı hook / taslak / senaryo sunucuda denetlenir; geçmeyen değişiklik YAZILMAZ
 * ve sebebi döner. Saf; LLM ve DB yok. `generate-ideas-validate.ts` ile AYNI kural parçalarını kullanır (`script-rules.ts`), kanıt ve
 * alıntı bağlamı gerektirmez (değişiklik fikrin kanıtını, başlığını ve gerekçesini DEĞİŞTİRMEZ):
 *  - Hook 3–5, boş değil, birbirinden farklı.
 *  - Dil: `en` içerikte Türkçe harf (ğ ş ı İ) yok.
 *  - Kopya engeli: hook ve senaryo ile fikrin rakip metinleri arasındaki en uzun ortak kelime dizisi < 8.
 *  - Senaryo verildiyse ≥ 15 kelime.
 *  - Gerçekten bir şey değişmeli (aynı içeriği geri vermek değişiklik sayılmaz).
 */
import "server-only";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { countWords, normalizeForMatch } from "@/lib/intel/normalize";
import type { RawRevision } from "@/lib/llm/revise-idea-schema";
import { REVISE_HOOKS_MAX, REVISE_HOOKS_MIN } from "@/lib/llm/revise-idea-schema";
import { COPY_WORD_LIMIT, hasTurkishOnlyLetters, maxSharedWithRivals, type RivalText } from "@/lib/llm/script-rules";

const SCRIPT_WORDS_MIN = 15;

/** Fikrin değişmeden önceki içeriği (aynısını geri vermeyi yakalamak için). */
export interface CurrentIdeaContent {
  hooks: readonly string[];
  scriptOutline: readonly string[];
  script?: string;
}

export interface ReviseValidationContext {
  language: ContentLanguage;
  current: CurrentIdeaContent;
  /** Kopya denetimi için fikrin rakip metinleri (alıntılar, kanıt alt yazıları). */
  rivals: readonly RivalText[];
}

export type RevisionVerdict = { ok: true } | { ok: false; reason: string };

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((text, i) => normalizeForMatch(text) === normalizeForMatch(b[i] ?? ""));

export function validateRevision(output: RawRevision, ctx: ReviseValidationContext): RevisionVerdict {
  const hookTexts = output.hooks.map((h) => h.text);
  if (hookTexts.length < REVISE_HOOKS_MIN || hookTexts.length > REVISE_HOOKS_MAX) return { ok: false, reason: `Hook sayısı ${REVISE_HOOKS_MIN}-${REVISE_HOOKS_MAX} olmalı.` };
  if (new Set(hookTexts.map(normalizeForMatch)).size !== hookTexts.length) return { ok: false, reason: "Hook'lar birbirinden farklı olmalı." };
  const produced = output.script === undefined ? hookTexts : [...hookTexts, output.script];
  if (hasTurkishOnlyLetters(ctx.language, [...produced, ...output.outline])) return { ok: false, reason: "İçerik dili İngilizce: hook ve senaryoda Türkçe harf (ğ ş ı İ) olmamalı." };
  if (output.script !== undefined && countWords(output.script) < SCRIPT_WORDS_MIN) return { ok: false, reason: `Senaryo en az ${SCRIPT_WORDS_MIN} kelime olmalı.` };
  const { maxSharedWords } = maxSharedWithRivals(produced, ctx.rivals);
  if (maxSharedWords >= COPY_WORD_LIMIT) return { ok: false, reason: `Metin bir rakip metniyle ${maxSharedWords} kelimelik ortak dizi taşıyor (kopya); kendi sözlerinle yaz.` };
  const unchanged = same(hookTexts, ctx.current.hooks) && same(output.outline, ctx.current.scriptOutline) && (output.script === undefined || normalizeForMatch(output.script) === normalizeForMatch(ctx.current.script ?? ""));
  if (unchanged) return { ok: false, reason: "İçerik öncekiyle aynı; istenen değişiklik yapılmamış." };
  return { ok: true };
}
