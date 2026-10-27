/**
 * Brif ve fikir metninin DİL denetimleri (saf; LLM ve DB yok): (1) rakipsiz hesapta metin rakipten söz etmez (olmayan bir kanıtı varmış
 * gibi göstermek yanıltır), (2) dayanağı düşük/orta güvenli slotun metni kesinlik sözü taşımaz ("bundan eminim" gibi). Brif denetimi
 * (`creative-brief-validate.ts`) ve fikir denetimi (`generate-ideas-validate.ts`) aynı işlevleri kullanır; istem kuralı `prompt-blocks.ts`'te.
 */
import { foldTurkish } from "@/lib/text";

/** Güveni abartılmaması gereken dereceler (dayanak `high` değilse kesinlik sözü yok). */
export const HEDGED_CONFIDENCES: ReadonlySet<string> = new Set(["low", "medium"]);
export const isHedgedConfidence = (confidence: string | undefined): boolean => confidence !== undefined && HEDGED_CONFIDENCES.has(confidence);

/** "rakipsiz" (rakibi olmayan) rakipten söz etmek değildir: konu gereği geçebilir. */
const RIVAL_WORD = /(^|[^\p{L}])rak(ip|ib)(?!siz)/u; // "rakibin": p→b yumuşaması
/** Kesinlik sözleri (katlanmış metinde): "emin olamayız" gibi olumsuz çekimler sayılmaz. */
const CERTAINTY_WORD = /(^|[^\p{L}])(eminim|emin\s+ol(?!ama|unama|may|mak)\w*|kesin|kesinlikle|garanti\w*)(?![\p{L}])/gu;
/** Güçlü genelleme ("sürekli iyi gidiyor", "her zaman tutuyor"): düşük/orta güvende kesinlik taşır. */
const GENERALIZATION = /(^|[^\p{L}])((?:surekli|her\s+zaman|daima|asla)\s+(?:\p{L}+\s+)?(?:gidiyor|gider|tutuyor|tutar|ise\s+yariyor|ise\s+yarar|kazandiriyor))(?![\p{L}])/u;
/** Kesinlik sözünü hemen izleyen kümedeki olumsuzlama: "kesin değil", "garantisi yok", "garanti veremem", "kesin söylemek zor". */
const NEGATION = /^(?:degil\w*|yok|yoktur|zor|zordur|olmaz\w*|olamaz\w*|\w*(?:mi|mu)yor\w*|\w*(?:ma|me)(?:m|z|yiz|yacak\w*|dik\w*)|\w*(?:ama|eme)(?:m|z|yiz|yacak\w*|dik\w*))$/u;
const NEGATION_WINDOW = 4;

/** Eşleşmenin hemen ardından (aynı cümlede) olumsuzlama var mı. */
function negatedAfter(folded: string, end: number): boolean {
  const clause = folded.slice(end).split(/[.!?;\n]/u)[0] ?? "";
  return clause.split(/[^\p{L}]+/u).filter(Boolean).slice(0, NEGATION_WINDOW).some((word) => NEGATION.test(word));
}

/** Rakipsiz modda metinde "rakip" kökü varsa sorun cümlesi (yoksa undefined). */
export function rivalMentionProblem(field: string, text: string | undefined): string | undefined {
  if (text === undefined || !RIVAL_WORD.test(foldTurkish(text))) return undefined;
  return `${field}: bu hesapta rakip verisi yok; metinde rakipten söz etme (kendi tutanlarından öğrenildiğini yaz)`;
}

/** Dayanak düşük/orta güvenliyse metinde kesinlik sözü varsa sorun cümlesi (yoksa undefined). */
export function certaintyProblem(field: string, text: string | undefined, confidence: string | undefined): string | undefined {
  if (text === undefined || !isHedgedConfidence(confidence)) return undefined;
  const folded = foldTurkish(text);
  let found: string | undefined;
  for (const match of folded.matchAll(CERTAINTY_WORD)) {
    if (!negatedAfter(folded, (match.index ?? 0) + match[0].length)) {
      found = match[2];
      break;
    }
  }
  found ??= GENERALIZATION.exec(folded)?.[2];
  if (found === undefined) return undefined;
  return `${field}: dayanak güveni ${confidence === "low" ? "düşük" : "orta"}; kesinlik sözü ("${found}") kullanma, "işe yarayabilir" gibi ölçülü yaz`;
}
