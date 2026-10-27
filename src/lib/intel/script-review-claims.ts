/**
 * Senaryo editörünün `wrong` (yanlış) bulduğu olguların GÖRÜNÜR kılınması (saf; LLM ve DB yok). Editör web erişimi olmadan modelin kendi bilgisiyle
 * düzeltir: doğru bir olguyu "düzeltmiş" olabilir, bu yüzden her düzeltme okunur satır olarak plan notuna ve markdown'a yazılır
 * ("Düzeltilen olgu: <eski> → <not>") ve insan bakar. Editör yalnız `details.script`'i yeniden yazar; yanlış olgu hook'larda ya da senaryo
 * adımlarında (`scriptOutline`) da geçiyor olabilir: oraları DÜZELTMEYİZ, yalnız işaretleriz (`claimsStillInHooksOrOutline`).
 */
import type { ScriptClaim, ScriptReview } from "@/lib/domain/script-review";
import { longestSharedWordRun, normalizeForMatch } from "@/lib/intel/normalize";

/** Yanlış bulunan iddia parçası bu kadar ya da daha uzun ortak kelime dizisiyle bir hook / adımda geçiyorsa "geçiyor" sayılır. */
const SHARED_WORDS_FLAG = 4;
const YEAR_OR_NUMBER = /\p{N}{2,}(?:[.,]\p{N}+)*/gu;

export const wrongClaimsOf = (review: ScriptReview): ScriptClaim[] => review.claims.filter((claim) => claim.verdict === "wrong");

/** "Düzeltilen olgu: "<eski>" → <not>" satırları (yanlış iddia yoksa boş). */
export function correctedFactLines(review: ScriptReview): string[] {
  return wrongClaimsOf(review).map((claim) => `Düzeltilen olgu: "${claim.text}" → ${claim.note}`);
}

function mentions(field: string, claim: ScriptClaim): boolean {
  const flat = normalizeForMatch(field);
  if (flat.includes(normalizeForMatch(claim.text))) return true;
  if (longestSharedWordRun(claim.text, field) >= SHARED_WORDS_FLAG) return true;
  return (normalizeForMatch(claim.text).match(YEAR_OR_NUMBER) ?? []).some((n) => new RegExp(`(^|[^\\p{N}])${n.replace(/[.]/g, "\\.")}(?![\\p{N}])`, "u").test(flat));
}

/** Yanlış bulunan iddiaların hook'larda ya da senaryo adımlarında geçenleri (iddia metni; yoksa boş). */
export function claimsStillInHooksOrOutline(review: ScriptReview, hooks: readonly string[], outline: readonly string[]): string[] {
  const fields = [...hooks, ...outline];
  return wrongClaimsOf(review)
    .filter((claim) => fields.some((field) => mentions(field, claim)))
    .map((claim) => claim.text);
}
