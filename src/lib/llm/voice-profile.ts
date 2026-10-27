/**
 * Görev 2 — marka sesi profili (`llm_voice_profile`): kendi hesabın açıklama + transcript'lerinden "nasıl konuşuyor". Çıktı
 * `VoiceProfile` özelliklerine (`domain/voice-profile.ts`) eşlenir; kimlik/ait olduğu hesap/istatistik alanlarını çağıran (D) doldurur.
 *
 * KOD DOĞRULAMASI (LLM'e güvenilmez):
 *  - Her özelliğin her alıntısı, GÖSTERDİĞİ içeriğin korpusunda `verifyEvidence` yoluyla (normalleştirme + kelime sınırı + ≥ 2 kelime)
 *    aranır. Bulunamayan alıntı atılır ve özellik `verified: false` olur (doğrulanmamış özellik script'e girmez); alıntısız özellik de doğrulanmamıştır.
 *  - İmza ifadeleri (≥ 2 kelime) korpusta birebir geçmeli, değilse atılır. "Kaçınılacak" ifade kendi metninde GEÇİYORSA atılır (çelişki).
 *    Kaçınılacak ifadeler doğası gereği kanıtlanamaz (ne söylemediğini gösteremeyiz): düşük güvenli öneri sayılır.
 *  - Doğrulanmış özellik < 5 ise profil kullanılamaz (`isVoiceProfileUsable`): `usable: false`. Sorun varsa 1 düzeltme turu yapılır,
 *    sonuç yine kusurluysa atılanlar işaretlenmiş olarak kabul edilir (`reviewFailure: "accept"`).
 */
import "server-only";

import { z } from "zod";

import { isVoiceProfileUsable, verifiedTraits, VOICE_MIN_VERIFIED_TRAITS, type VoiceLexicon, type VoiceTrait } from "@/lib/domain/voice-profile";
import { checkQuote, contentContainsPhrase, hasAnyText, indexById, type ContentText } from "@/lib/llm/content-text";
import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, UNTRUSTED_DATA_RULE, VERBATIM_QUOTE_RULE } from "@/lib/llm/prompt-blocks";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";
import { wordTokens } from "@/lib/intel/normalize";

export const PROMPT_VERSION = "voice-profile-v2";
const TRANSCRIPT_CHARS = 4000;
const CAPTION_CHARS = 800;
const DEFAULT_TIMEOUT_MS = 240_000;
const MAX_SIGNATURE = 8;
const MAX_AVOID = 6;

export interface VoiceProfileInput {
  /** Kendi hesabın adı ("@" yok). */
  ownerHandle: string;
  /** İçerik dili (çalışma alanı içerik dili: "tr" | "en"); modele söylenir ve profile aynen yazılır. */
  language?: string;
  /** Kendi içeriklerin: `id` = `content_items.id`; en az biri metinli olmalı. */
  contents: readonly ContentText[];
}

export interface VoiceProfileDraft {
  language?: string;
  summary: string;
  traits: VoiceTrait[];
  lexicon: VoiceLexicon;
  /** Modele gösterilen (metinli) içerik sayısı. */
  sampleSize: number;
  verifiedTraitCount: number;
  /** ≥ 5 doğrulanmış özellik (`isVoiceProfileUsable`). */
  usable: boolean;
  /** Atılan/doğrulanamayan alıntı ve ifadelerin Türkçe notları (günlük/uyarı için). */
  notes: string[];
  promptVersion: string;
  meta: LlmCallMeta;
}

export const VOICE_OUTPUT_SCHEMA = z.object({
  summary: z.string().min(1).max(500).describe("1-3 Turkish sentences on how the creator sounds"),
  traits: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).describe("Stable lowercase kebab-case key, e.g. direct-address"),
        label: z.string().min(1).max(60).describe("Turkish name, 2-4 words"),
        description: z.string().min(1).max(300).describe("One Turkish sentence"),
        examples: z
          .array(z.object({ contentId: z.string().describe("Id of the post the quote comes from"), quote: z.string().min(1).max(300) }))
          .min(1)
          .max(3),
      }),
    )
    .min(1)
    .max(12),
  lexicon: z.object({
    signaturePhrases: z.array(z.string().min(1).max(120)).max(10),
    avoidPhrases: z.array(z.string().min(1).max(120)).max(8),
  }),
});
type VoiceOutput = z.infer<typeof VOICE_OUTPUT_SCHEMA>;

const SYSTEM_PROMPT = [
  "You build a brand-voice profile for ONE creator from their OWN posts (captions, spoken transcripts, on-screen text), so later scripts can be written in their voice. Read <posts>; each post has an id and some of: caption, transcript (what is spoken), screenText.",
  "",
  "Produce:",
  "- summary: 1-3 sentences on how this creator sounds.",
  "- traits: 6-10 distinct, observable voice traits (how they address the viewer, sentence rhythm, questions, story pattern, vocabulary register, framing such as faith/science/personal, how they open and close ...). For each: key (lowercase kebab-case), label, description, and 1-3 examples. Every example is a verbatim quote and the id of the post it came from; use different posts where possible.",
  "- lexicon.signaturePhrases: up to 8 recurring or characteristic phrases (2+ words), copied verbatim from the posts.",
  `- lexicon.avoidPhrases: up to ${MAX_AVOID} words or phrases that would sound off-brand for this creator (corporate jargon, cliches this creator never uses). Never list anything that appears in the posts.`,
  "",
  "Only claim traits the posts support; do not pad the list. Describe the creator, do not flatter.",
  VERBATIM_QUOTE_RULE,
  `${PANEL_LANGUAGE_RULE} Quotes and phrases stay in the creator's own language, exactly as written.`,
  UNTRUSTED_DATA_RULE,
  JSON_ONLY_RULE,
].join("\n");

interface AnalyzedVoice {
  traits: VoiceTrait[];
  signaturePhrases: string[];
  avoidPhrases: string[];
  /** Tüm atılan/doğrulanamayan öğelerin notları. */
  notes: string[];
  /** Notların düzeltme turu gerektirenleri: özelliklerin doğrulanamayan alıntıları. */
  quoteProblems: string[];
}

/** Model çıktısını içerik metinlerine karşı denetler (saf; LLM yok). */
export function analyzeVoiceOutput(output: VoiceOutput, contents: readonly ContentText[]): AnalyzedVoice {
  const byId = indexById(contents);
  const notes: string[] = [];
  const quoteProblems: string[] = [];
  const seenKeys = new Set<string>();
  const traits: VoiceTrait[] = [];

  for (const raw of output.traits) {
    if (seenKeys.has(raw.key)) {
      notes.push(`"${raw.key}" özelliği birden fazla geldi; ilki tutuldu.`);
      continue;
    }
    seenKeys.add(raw.key);
    const examples: VoiceTrait["examples"] = [];
    let failed = false;
    for (const example of raw.examples) {
      const check = checkQuote(byId.get(example.contentId), example.quote);
      if (check.ok) {
        if (!examples.some((kept) => kept.contentItemId === example.contentId && kept.quote === example.quote)) examples.push({ contentItemId: example.contentId, quote: example.quote });
      } else {
        failed = true;
        const note = `${raw.key}: "${example.quote}" (${example.contentId}) — ${check.reason}.`;
        notes.push(note);
        quoteProblems.push(note);
      }
    }
    traits.push({ key: raw.key, label: raw.label.trim(), description: raw.description.trim(), verified: examples.length > 0 && !failed, examples });
  }

  const signaturePhrases: string[] = [];
  for (const phrase of output.lexicon.signaturePhrases.map((p) => p.trim())) {
    if (phrase === "" || signaturePhrases.some((kept) => kept.toLowerCase() === phrase.toLowerCase())) continue;
    const found = contents.some((content) => checkQuote(content, phrase).ok);
    if (found) signaturePhrases.push(phrase);
    else notes.push(`İmza ifadesi atıldı (birebir bulunamadı ya da 2 kelimeden kısa): "${phrase}".`);
  }

  const avoidPhrases: string[] = [];
  for (const phrase of output.lexicon.avoidPhrases.map((p) => p.trim())) {
    if (phrase === "" || wordTokens(phrase).length === 0 || avoidPhrases.some((kept) => kept.toLowerCase() === phrase.toLowerCase())) continue;
    if (contents.some((content) => contentContainsPhrase(content, phrase))) notes.push(`Kaçınılacak ifade atıldı (kendi metninde geçiyor): "${phrase}".`);
    else avoidPhrases.push(phrase);
  }

  return { traits, signaturePhrases: signaturePhrases.slice(0, MAX_SIGNATURE), avoidPhrases: avoidPhrases.slice(0, MAX_AVOID), notes, quoteProblems };
}

/** Düzeltme turuna verilecek sorun metni (yoksa undefined): doğrulanamayan özellik alıntısı ya da yetersiz doğrulanmış özellik. */
function voiceProblem(analyzed: AnalyzedVoice): string | undefined {
  const verified = verifiedTraits({ traits: analyzed.traits }).length;
  const lines = [...analyzed.quoteProblems];
  if (verified < VOICE_MIN_VERIFIED_TRAITS) lines.push(`Yalnız ${verified} özellik doğrulandı; en az ${VOICE_MIN_VERIFIED_TRAITS} gerekli.`);
  if (lines.length === 0) return undefined;
  return `${lines.join("\n")}\nYalnız verilen metinlerden BİREBİR kopyala; bulamıyorsan özelliği çıkar ya da başka bir alıntı seç.`;
}

export interface VoiceProfileOptions {
  timeoutMs?: number;
  model?: string;
}

export async function buildVoiceProfile(backend: LlmBackend, input: VoiceProfileInput, options: VoiceProfileOptions = {}): Promise<VoiceProfileDraft> {
  const contents = input.contents.filter(hasAnyText);
  if (contents.length === 0) throw new LlmError("invalid_input", "Ses profili için metinli (açıklama ya da transcript) en az bir içerik gerekli.");
  if (new Set(contents.map((c) => c.id)).size !== contents.length) throw new LlmError("invalid_input", "İçerik id'leri tekil olmalı.");

  const posts = contents.map((content) => ({
    id: content.id,
    caption: clipForPrompt(content.caption, CAPTION_CHARS),
    transcript: clipForPrompt(content.transcript, TRANSCRIPT_CHARS),
    screenText: clipForPrompt(content.screenText, CAPTION_CHARS),
  }));

  const { value, meta } = await backend.runJson({
    task: "llm_voice_profile",
    system: SYSTEM_PROMPT,
    input: [dataBlock("creator", { handle: input.ownerHandle, language: input.language }), dataBlock("posts", posts)].join("\n\n"),
    schema: VOICE_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => voiceProblem(analyzeVoiceOutput(output, contents)),
    reviewFailure: "accept",
  });

  const analyzed = analyzeVoiceOutput(value, contents);
  const profile = { traits: analyzed.traits };
  return {
    language: input.language,
    summary: value.summary.trim(),
    traits: analyzed.traits,
    lexicon: { signaturePhrases: analyzed.signaturePhrases, avoidPhrases: analyzed.avoidPhrases },
    sampleSize: contents.length,
    verifiedTraitCount: verifiedTraits(profile).length,
    usable: isVoiceProfileUsable(profile),
    notes: analyzed.notes,
    promptVersion: PROMPT_VERSION,
    meta,
  };
}
