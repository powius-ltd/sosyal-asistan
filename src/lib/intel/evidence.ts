/**
 * Kanıt denetimi (docs/FAZ2-PLAN.md §3): modelin ürettiği her alıntı SUNUCUDA korpusta aranır; bulunamayan alıntı analizi
 * "doğrulanmamış" yapar (`evidenceVerified = false`) ve ekranda uyarı olarak görünür. Saf; LLM ve DB yok.
 *
 * Kurallar:
 *  - Karşılaştırma `normalizeForMatch` ile (NFKC + tırnak/tire düzleştirme + `foldTurkish` + tek boşluk) ve KELİME SINIRINDA:
 *    "the end" alıntısı "breathe endlessly" içinde "bulunmuş" sayılmaz.
 *  - Korpus = konuşma ∪ ekran yazısı ∪ açıklama (kanal kanal aranır, kanallar birleştirilmez). Hook, bildirdiği kaynağın (`hookSource`)
 *    kendi korpusunda aranır; diğer alıntılar (hook türü kanıtı, bölüm, etiket) üç kanalda da aranır (konuşma önce).
 *  - Hook ≤ 200 karakter (`HOOK_MAX_CHARS`). Konuşma kaynaklı hook, konuşmanın İLK %25'inde başlamalı (`HOOK_FIRST_PORTION`): açılış
 *    cümlesi olmayan bir alıntı "hook" değildir. Ekran yazısı/açıklama kaynaklı hook'ta konum kuralı yoktur.
 *  - Diğer alıntılar ≥ 2 kelime olmalı (`MIN_QUOTE_WORDS`): "the" gibi bir alıntı her metinde bulunur, kanıt olmaz.
 *  - Konuşma + ekran yazısı < 8 kelime (`MIN_MEANINGFUL_WORDS`) → `insufficientData` (müzik/sessiz video: analiz `insufficient_data`).
 *    Açıklama bu sayıma girmez (videonun kendi içeriği değildir).
 *  - Hook verilmezse doğrulama başarısızdır (başarılı analizin hook'u olur).
 *
 * Not: aynı model transkripti ve alıntıyı birlikte ürettiği için bu bir ÖZ-TUTARLILIK denetimidir, bağımsız doğrulama değil;
 * gerçek doğrulama için elle 3 video kontrolü planlıdır (FAZ2-PLAN §3).
 */
import {
  MIN_MEANINGFUL_WORDS,
  type EvidenceChannel,
  type EvidenceCheck,
  type EvidenceFailure,
  type EvidenceReport,
  type HookSource,
} from "@/lib/domain/intel";
import { countWords, normalizeForMatch } from "@/lib/intel/normalize";

export const HOOK_MAX_CHARS = 200;
/** Konuşma kaynaklı hook'un başlayabileceği en uzak konum (konuşma uzunluğunun oranı). */
export const HOOK_FIRST_PORTION = 0.25;
export const MIN_QUOTE_WORDS = 2;

export interface EvidenceCorpus {
  /** Konuşma transkripti. */
  speech?: string;
  /** Ekrana basılan yazılar. */
  screenText?: string;
  /** Gönderi açıklaması. */
  caption?: string;
}

export interface EvidenceClaims {
  hook?: { text: string; source: HookSource };
  /** Hook türünü doğrulayan alıntı; türü olmayan analizde verilmez (`undefined` = denetlenmez). */
  hookTypeEvidence?: string;
  sections?: readonly { type: string; quote: string }[];
  labels?: readonly { key: string; evidence: string }[];
}

type NormalizedCorpus = Record<EvidenceChannel, string>;

const CHANNEL_ORDER: readonly EvidenceChannel[] = ["speech", "screen_text", "caption"];
const WORD_CHAR = /[\p{L}\p{N}]/u;

function normalizeCorpus(corpus: EvidenceCorpus): NormalizedCorpus {
  return {
    speech: normalizeForMatch(corpus.speech ?? ""),
    screen_text: normalizeForMatch(corpus.screenText ?? ""),
    caption: normalizeForMatch(corpus.caption ?? ""),
  };
}

/** Kelime sınırında ilk eşleşmenin konumu (yoksa -1). `needle` aranan normalleştirilmiş metindir. */
function indexOfWords(haystack: string, needle: string): number {
  if (needle === "") return -1;
  const startsWithWord = WORD_CHAR.test(needle[0]);
  const endsWithWord = WORD_CHAR.test(needle[needle.length - 1]);
  for (let from = 0; ; from += 1) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return -1;
    const before = index === 0 ? "" : haystack[index - 1];
    const after = haystack[index + needle.length] ?? "";
    const startOk = !startsWithWord || before === "" || !WORD_CHAR.test(before);
    const endOk = !endsWithWord || after === "" || !WORD_CHAR.test(after);
    if (startOk && endOk) return index;
    from = index;
  }
}

function fail(base: Omit<EvidenceCheck, "found" | "failure" | "channel">, failure: EvidenceFailure): EvidenceCheck {
  return { ...base, found: false, failure };
}

/** Hook: bildirdiği kaynağın korpusunda; ≤ 200 karakter; konuşmada ilk %25'te başlar. */
function checkHook(corpus: NormalizedCorpus, hook: { text: string; source: HookSource }): EvidenceCheck {
  const base = { target: "hook" as const, quote: hook.text };
  const needle = normalizeForMatch(hook.text);
  if (needle === "") return fail(base, "empty");
  if (Array.from(hook.text.trim()).length > HOOK_MAX_CHARS) return fail(base, "too_long");
  const haystack = corpus[hook.source];
  const index = indexOfWords(haystack, needle);
  if (index < 0) return fail(base, "not_found");
  if (hook.source === "speech" && index > HOOK_FIRST_PORTION * haystack.length) return fail(base, "outside_first_quarter");
  return { ...base, found: true, channel: hook.source };
}

/** Diğer alıntılar: üç kanalda (konuşma önce); ≥ 2 kelime. */
function checkQuote(corpus: NormalizedCorpus, target: EvidenceCheck["target"], key: string | undefined, quote: string): EvidenceCheck {
  const base = { target, ...(key === undefined ? {} : { key }), quote };
  const needle = normalizeForMatch(quote);
  if (needle === "") return fail(base, "empty");
  if (countWords(quote) < MIN_QUOTE_WORDS) return fail(base, "too_short");
  for (const channel of CHANNEL_ORDER) if (indexOfWords(corpus[channel], needle) >= 0) return { ...base, found: true, channel };
  return fail(base, "not_found");
}

export function verifyEvidence(corpus: EvidenceCorpus, claims: EvidenceClaims): EvidenceReport {
  const normalized = normalizeCorpus(corpus);
  const corpusWords = countWords(corpus.speech ?? "") + countWords(corpus.screenText ?? "");

  const checks: EvidenceCheck[] = [];
  const hookCheck = claims.hook ? checkHook(normalized, claims.hook) : fail({ target: "hook", quote: "" }, "empty");
  checks.push(hookCheck);
  if (claims.hookTypeEvidence !== undefined) checks.push(checkQuote(normalized, "hook_type", undefined, claims.hookTypeEvidence));
  for (const section of claims.sections ?? []) checks.push(checkQuote(normalized, "section", section.type, section.quote));
  for (const label of claims.labels ?? []) checks.push(checkQuote(normalized, "label", label.key, label.evidence));

  const failures = checks.filter((check) => !check.found);
  const insufficientData = corpusWords < MIN_MEANINGFUL_WORDS;
  return {
    verified: !insufficientData && failures.length === 0,
    corpusWords,
    insufficientData,
    hookChannel: hookCheck.found ? hookCheck.channel : undefined,
    checked: checks.length,
    passed: checks.length - failures.length,
    failures,
  };
}

/** Konuşma metni "anlamlı" mı (transkript `is_meaningful`): ≥ `MIN_MEANINGFUL_WORDS` kelime. */
export function isMeaningfulSpeech(text: string | undefined): boolean {
  return text !== undefined && countWords(text) >= MIN_MEANINGFUL_WORDS;
}
