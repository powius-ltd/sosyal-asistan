/**
 * "Yeni kişisel olgu yok" kuralı (senaryo editörü denetimi; saf, LLM ve DB yok). Editör hesap sahibinin hayatından yeni olgu ya da anlatı
 * EKLEYEMEZ. Kural bilerek BASİT ve kod tabanlıdır (anlamsal değil); iki işaret, ikisi de yalnız revize metinde YENİ olanları sayar
 * (özgün senaryoda zaten geçen işaret sorun değildir):
 *  1. Birinci tekil kişi + geçmiş zaman anlatısı: `tr` "-dım / -dim / -dum / -düm / -tım …" ile biten sözcük ("gittim", "yaşadım"), `en`
 *     "I" + geçmiş fiil ("I went", "I lost", "I started"). "adım", "tutum" gibi isimler hariçtir.
 *  2. Yeni özel ad: cümle başında olmayan büyük harfli sözcük, kökü özgün metindeki hiçbir sözcükle (≥ 4 harflik ön ek dahil) örtüşmüyor.
 * İstisna: yanlış (`wrong`) bulunan iddianın notunda geçen adlar serbesttir (düzeltmenin doğrusu). Bilinen sınır: yazıyla anlatılan olgular
 * ve özgünde olmayan ama ad içermeyen kişisel iddialar ("üç yıl önce" gibi, sayı kuralına girmeyen) bu kuralla yakalanmaz.
 */
import type { ContentLanguage } from "@/lib/domain/content-language";
import { normalizeForMatch } from "@/lib/intel/normalize";
import { foldTurkish } from "@/lib/text";

/** Birinci tekil geçmiş (katlanmış metinde: ı→i, ü→u): "gittim", "yasadim", "kaybettim", "yaptim". */
const TR_FIRST_PERSON_PAST = /(?<![\p{L}])(\p{L}{2,}[dt][iu]m)(?![\p{L}])/gu;
/** Birinci tekil geçmiş gibi görünen ama isim olan sözcükler (katlanmış). */
const TR_NOT_VERBS: ReadonlySet<string> = new Set(["adim", "kadim", "tutum", "atim", "hitim"]);
const EN_IRREGULAR_PAST = "was|had|went|did|got|saw|felt|took|made|found|lost|quit|spent|built|bought|ran|ate|drank|knew|thought|told|said|began|kept|left|met|paid|read|sat|stood|taught|won|wrote|gave|came|became|fell|grew|heard|held|learned|slept|woke";
/** "-ed" ile biten ama geçmiş zaman olmayan fiiller ("I need", "I proceed"). */
const EN_NOT_PAST = "need|feed|speed|proceed|succeed|exceed|bleed|breed|heed";
const EN_FIRST_PERSON_PAST = new RegExp(`\\bI(?:'ve|'d)?\\s+((?:${EN_IRREGULAR_PAST}|(?!(?:${EN_NOT_PAST})\\b)[a-z]{2,}ed))\\b`, "gi");

const PROPER_NOUN = /\p{Lu}[\p{L}]+/gu;
const PREFIX_MATCH_MIN = 4;
/** Cümle başı: metin başı ya da . ! ? … : " satır sonu / açılış tırnağından sonra. */
const SENTENCE_START = /(?:^|[.!?…:\n"“(\-–—]\s*)$/u;

const stemOf = (word: string): string => foldTurkish(word.split(/['’]/u)[0] ?? word);

/** Metindeki birinci tekil geçmiş zaman işaretleri (dile göre; katlanmış, tekil). */
export function personalPastMarkers(text: string, language: ContentLanguage): Set<string> {
  const markers = new Set<string>();
  if (language === "tr") {
    for (const match of foldTurkish(text).matchAll(TR_FIRST_PERSON_PAST)) if (!TR_NOT_VERBS.has(match[1])) markers.add(match[1]);
  } else {
    for (const match of text.matchAll(EN_FIRST_PERSON_PAST)) markers.add(`i ${match[1].toLowerCase()}`);
  }
  return markers;
}

/** Cümle başında olmayan büyük harfli sözcükler (kök, katlanmış). */
export function properNounStems(text: string): Map<string, string> {
  const nouns = new Map<string, string>();
  for (const match of text.matchAll(PROPER_NOUN)) {
    const before = text.slice(0, match.index);
    if (SENTENCE_START.test(before)) continue;
    const stem = stemOf(match[0]);
    if (stem.length >= 2 && !nouns.has(stem)) nouns.set(stem, match[0]);
  }
  return nouns;
}

const wordStems = (text: string): string[] => normalizeForMatch(text).match(/[\p{L}\p{N}]+/gu) ?? [];
const overlaps = (stem: string, known: string): boolean => stem === known || (known.length >= PREFIX_MATCH_MIN && stem.startsWith(known)) || (stem.length >= PREFIX_MATCH_MIN && known.startsWith(stem));

/**
 * Revize metnin özgün senaryoda olmayan kişisel anlatı / özel ad eklemesi (sorun cümleleri; [] = temiz). `allowedText`: düzeltmenin doğrusunu
 * taşıyan `wrong` iddia notları (orada geçen adlar serbest).
 */
export function newPersonalFactProblems(original: string, revised: string, language: ContentLanguage, allowedText: string): string[] {
  const problems: string[] = [];
  const before = personalPastMarkers(original, language);
  const added = [...personalPastMarkers(revised, language)].filter((marker) => !before.has(marker));
  if (added.length > 0) problems.push(`revize metin özgünde olmayan kişisel anlatı ekliyor (${added.join(", ")}): hesap sahibinin hayatından yeni olgu ya da deneyim ekleme`);

  const known = [...wordStems(original), ...wordStems(allowedText)].map((word) => word.split("'")[0]);
  const newNouns = [...properNounStems(revised)].filter(([stem]) => !known.some((word) => overlaps(stem, word))).map(([, shown]) => shown);
  if (newNouns.length > 0) problems.push(`revize metin özgünde olmayan özel ad ekliyor (${newNouns.join(", ")}); yalnız yanlış bulduğun iddianın doğrusunu notuna yazıp o adı koyabilirsin`);
  return problems;
}
