/**
 * Senaryo editörü çıktısının KOD DENETİMİ (saf; LLM ve DB yok). Kurallar (SPEC 16 görev 6):
 *  - revize metnin kelime sayısı özgünün ±%25'i içinde;
 *  - özgün senaryoda birebir geçen kanıt / kişisel alıntı revize metinde de geçer (anlamı değişmez);
 *  - revize metin yeni sayı / yıl eklemez; tek istisna `wrong` iddia varsa (düzeltmenin doğrusu) ve o düzeltmenin notunda geçen sayılardır;
 *  - her iddia parçası özgün senaryodan birebir (normalize) alınmıştır;
 *  - `wrong` iddianın parçası revize metinde ARTIK geçmez (düzeltilmiştir);
 *  - fikir denetiminin SENARYO kuralları revize metinden yeniden geçer (`script-rules.ts`, `script-personal-facts.ts`): rakip metinleriyle
 *    ≥ 8 ardışık ortak kelime = kopya (düzeltme atılır, özgün kalır), `en` içerikte Türkçe harf yok, yeni kişisel olgu yok (özgünde olmayan
 *    birinci tekil geçmiş zaman anlatısı ya da yeni özel ad; yanlış iddianın notundaki adlar serbest).
 * Geçen çıktı `ScriptReview`'e çevrilir (`finalizeReview`).
 */
import type { ContentLanguage } from "@/lib/domain/content-language";
import type { ScriptReview } from "@/lib/domain/intel";
import { normalizeForMatch, wordTokens } from "@/lib/intel/normalize";
import { newPersonalFactProblems } from "@/lib/llm/script-personal-facts";
import { CLAIMS_MAX, type RawScriptReview } from "@/lib/llm/script-review-schema";
import { COPY_WORD_LIMIT, hasTurkishOnlyLetters, maxSharedWithRivals, type RivalText } from "@/lib/llm/script-rules";

/** İddia sayısı `CLAIMS_MAX`'a ulaşınca "doğrula" listesine eklenen satır (kalan iddialar denetlenmedi). */
export const CLAIMS_CAPPED_NOTE = `Kalan iddialar denetlenmedi: editör en çok ${CLAIMS_MAX} iddia inceledi, senaryodaki diğer olguları yayından önce kendin doğrula.`;

/** Revize metnin özgün kelime sayısına göre izinli sapması. */
export const WORD_COUNT_TOLERANCE = 0.25;

export interface ScriptReviewContext {
  /** Özgün senaryo. */
  script: string;
  /** Hesap sahibinin kişisel olgu alıntıları: özgün senaryoda birebir geçenler revizede de geçmelidir (rakip alıntıları DEĞİL: onlar yalnız bağlamdır). */
  quotes: readonly string[];
  /** Senaryo dili (`en`'de Türkçe harf yasağı, kişisel anlatı kuralı dile göre). */
  language: ContentLanguage;
  /** Havuzdaki rakip metinleri (`rivalTexts`): revize metin bunlarla ≥ `COPY_WORD_LIMIT` ortak kelime dizisi paylaşamaz. */
  rivalTexts: readonly RivalText[];
}

const DIGITS = /\p{N}+(?:[.,]\p{N}+)*/gu;
const numbersOf = (text: string): Set<string> => new Set(normalizeForMatch(text).match(DIGITS) ?? []);
const contains = (haystack: string, needle: string): boolean => normalizeForMatch(haystack).includes(normalizeForMatch(needle));

/** Çıktının sorunları ([] = temiz); her sorun modele geri verilebilecek kısa Türkçe cümledir. */
export function reviewProblems(raw: RawScriptReview, ctx: ScriptReviewContext): string[] {
  const problems: string[] = [];
  const before = wordTokens(ctx.script).length;
  const after = wordTokens(raw.revisedScript).length;
  if (before > 0 && Math.abs(after - before) > before * WORD_COUNT_TOLERANCE) problems.push(`revize metnin kelime sayısı özgünün ±%${WORD_COUNT_TOLERANCE * 100} aralığında kalmalı (özgün ${before}, revize ${after})`);

  for (const quote of ctx.quotes) {
    if (quote.trim() !== "" && contains(ctx.script, quote) && !contains(raw.revisedScript, quote)) problems.push(`kişisel olgu alıntısı revizede aynen korunmalı: "${quote}"`);
  }

  const wrong = raw.claims.filter((claim) => claim.verdict === "wrong");
  const allowed = numbersOf(ctx.script);
  if (wrong.length > 0) for (const claim of wrong) for (const n of numbersOf(claim.note)) allowed.add(n);
  const added = [...numbersOf(raw.revisedScript)].filter((n) => !allowed.has(n));
  if (added.length > 0) problems.push(`revize metin özgünde olmayan sayı / yıl eklemiş (${added.join(", ")}); yalnız yanlış bulduğun iddianın doğrusunu notuna yazıp o kadarını koyabilirsin`);

  raw.claims.forEach((claim, index) => {
    if (!contains(ctx.script, claim.text)) problems.push(`claims.${index}.text özgün senaryodan birebir alınmamış: "${claim.text}"`);
  });
  for (const claim of wrong) {
    if (contains(raw.revisedScript, claim.text)) problems.push(`yanlış bulunan iddia revize metinde hâlâ duruyor, düzelt: "${claim.text}"`);
  }

  const shared = maxSharedWithRivals([raw.revisedScript], ctx.rivalTexts);
  if (shared.maxSharedWords >= COPY_WORD_LIMIT) problems.push(`kopya: revize metin ${shared.copiedFrom} rakip içeriğiyle ${shared.maxSharedWords} kelimelik ortak dizi paylaşıyor (sınır < ${COPY_WORD_LIMIT}); rakip metinlerini senaryoya taşıma`);
  if (hasTurkishOnlyLetters(ctx.language, [raw.revisedScript])) problems.push("revize metin İngilizce olmalı: Türkçe harf bulundu");
  problems.push(...newPersonalFactProblems(ctx.script, raw.revisedScript, ctx.language, wrong.map((claim) => claim.note).join(" ")));
  return problems;
}

/** Yalnız boşluk sadeleştirmesi: harf (diyakritik, büyük/küçük) düzeltmesi DEĞİŞİKLİKTİR (normalizeForMatch bunu silerdi). */
const collapseSpaces = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Sorunsuz ham çıktıyı `ScriptReview`'e çevirir (özgün metin yalnız değiştiyse saklanır). */
export function finalizeReview(raw: RawScriptReview, script: string, promptVersion: string): ScriptReview {
  const revisedScript = raw.revisedScript.trim();
  const revised = collapseSpaces(revisedScript) !== collapseSpaces(script);
  const wrongCount = raw.claims.filter((claim) => claim.verdict === "wrong").length;
  const verifyBeforePublish = raw.claims.filter((claim) => claim.verdict === "uncertain").map((claim) => `"${claim.text.trim()}" — ${claim.note.trim()}`);
  // İddia sayısı tavana dayandıysa kalan iddialar hiç incelenmemiş olabilir: "doğrula: yok" demek yanıltır.
  if (raw.claims.length >= CLAIMS_MAX) verifyBeforePublish.push(CLAIMS_CAPPED_NOTE);
  return {
    revised,
    ...(revised ? { originalScript: script } : {}),
    changes: raw.changes.map((change) => change.trim()),
    claims: raw.claims.map((claim) => ({ text: claim.text.trim(), verdict: claim.verdict, note: claim.note.trim() })),
    corrections: raw.changes.length + wrongCount,
    verifyBeforePublish,
    promptVersion,
  };
}
