/**
 * Başlangıç `draft_niche` adımı: hesabın biyografisi + son açıklamalarından TEK hafif yazı çağrısıyla konu taslağı. Taslak kullanıcıya
 * düzeltmesi için gösterilir (boş da geçebilir); bu yüzden adım HİÇ fırlatmaz: metin yoksa çağrı yapılmaz, model emin değilse ya da çağrı
 * düşerse taslak yoktur (`draft` undefined) ve iş sürer.
 *
 * Girdi yalnız hesabın KENDİ herkese açık metnidir (biyografi, kategori, açıklama, etiket); veri bloklarında gider, talimat değildir. Çağrı
 * abonelik koşusu olarak kaydedilir (tutar yok). Koşu türü: ayrı bir tür (`LLM_KINDS`, sıralı dosya) açılana kadar en yakın tür olan konu
 * eleği (`llm_topic_screen`) kullanılır; hedef etiketi çağrıyı ayırır.
 */
import "server-only";

import { z } from "zod";

import { NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { ONBOARDING_NICHE_DRAFT_MAX_CHARS } from "@/lib/domain/onboarding-job";
import { lightModel, type IntelContext } from "@/lib/intel/context";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { createLlmBackend } from "@/lib/llm/backend";
import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, PLAIN_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import { LlmError, type LlmBackend, type LlmKind } from "@/lib/llm/types";
import { isLlmUnavailableError } from "@/lib/orchestrator/llm-failure";
import { truncateText } from "@/lib/text";

export const NICHE_DRAFT_PROMPT_VERSION = "niche-draft-v1";
export const NICHE_DRAFT_RUN_LABEL = "konu taslağı (başlangıç)";
const NICHE_DRAFT_KIND: LlmKind = "llm_topic_screen";
/** Taslağın üst sınırı (şema ve çalışma alanı konu alanı ile uyumlu). */
export const NICHE_DRAFT_MAX_CHARS = Math.min(ONBOARDING_NICHE_DRAFT_MAX_CHARS, NICHE_BRIEF_MAX_LENGTH);
const CAPTIONS_MAX = 25;
const CAPTION_CHARS = 300;
const BIO_CHARS = 500;
const TAGS_MAX = 15;
const TIMEOUT_MS = 90_000;

/** Taslağın dayandığı profil alanları (hesap doğrulamasından). */
export interface NicheDraftProfile {
  displayName?: string;
  bio?: string;
  category?: string;
}

export interface NicheDraftResult {
  /** Konu taslağı; çıkarılamadıysa yok. */
  draft?: string;
  /** Taslak yoksa nedeni: metin yok · model emin değil · çağrı düştü. */
  reason?: "no_text" | "unsure" | "llm_failed";
  /** Yazı aracı kalıcı olarak kullanılamıyor (oturum yok / kurulu değil). */
  persistent?: boolean;
  note?: string;
}

export interface NicheDraftInput {
  profile: NicheDraftProfile;
  captions: readonly string[];
  hashtags: readonly string[];
}

export const NICHE_DRAFT_SCHEMA = z.object({
  confident: z.boolean().describe("true only when the given text clearly shows what the account is about"),
  niche: z.string().max(NICHE_DRAFT_MAX_CHARS).describe("Turkish, 1-3 short sentences: who the account speaks to and which subjects it covers; empty string when confident is false"),
});

const SYSTEM_PROMPT = [
  "You draft a short description of what a short-video account is about, from the account's own public text in <profile>, <captions> and <hashtags>. The account owner will read the draft and correct it, so write it as a plain first guess.",
  "",
  "Return:",
  "- confident: true only when the text clearly shows the subject of the account. If there is almost no text, or it is only emojis, greetings or generic tags, answer false.",
  "- niche: when confident, 1-3 short sentences saying who the account speaks to and which subjects it covers. Use everyday words. No hashtags, no account names or person names, no numbers, no advice, no praise. When not confident, an empty string.",
  "",
  "Describe only what the text shows; do not invent an audience, a product or a goal that is not there.",
  PANEL_LANGUAGE_RULE,
  PLAIN_LANGUAGE_RULE,
  UNTRUSTED_DATA_RULE,
  JSON_ONLY_RULE,
].join("\n");

const hasText = (value: string | undefined): value is string => value !== undefined && value.trim() !== "";

/** Taslağı üretir (saf çağrı; kayıt yok). Metin yoksa model ÇAĞRILMAZ. Kalıcı / geçici çağrı hatası fırlar (çağıran sınıflar). */
export async function draftNiche(backend: LlmBackend, input: NicheDraftInput, options: { model?: string; timeoutMs?: number } = {}) {
  const captions = input.captions.filter(hasText).slice(0, CAPTIONS_MAX).flatMap((caption) => clipForPrompt(caption, CAPTION_CHARS) ?? []);
  const profile = { displayName: clipForPrompt(input.profile.displayName, 150), bio: clipForPrompt(input.profile.bio, BIO_CHARS), category: clipForPrompt(input.profile.category, 80) };
  if (captions.length === 0 && !hasText(profile.bio)) return { draft: undefined, reason: "no_text" as const, meta: undefined };
  const { value, meta } = await backend.runJson({
    task: NICHE_DRAFT_KIND,
    system: SYSTEM_PROMPT,
    input: [dataBlock("profile", profile), dataBlock("captions", captions), dataBlock("hashtags", input.hashtags.slice(0, TAGS_MAX))].join("\n\n"),
    schema: NICHE_DRAFT_SCHEMA,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    model: options.model,
  });
  const text = truncateText(value.niche, NICHE_DRAFT_MAX_CHARS);
  return value.confident && text !== "" ? { draft: text, reason: undefined, meta } : { draft: undefined, reason: "unsure" as const, meta };
}

/** Kendi hesabın son açıklamaları ve en sık etiketleri (yalnız kendi içerik; rakip metni girmez). */
async function loadOwnText(ctx: Pick<IntelContext, "client" | "workspaceId">): Promise<Pick<NicheDraftInput, "captions" | "hashtags">> {
  const { data, error } = await ctx.client
    .from("content_items")
    .select("caption, hashtags")
    .eq("workspace_id", ctx.workspaceId)
    .not("social_account_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(CAPTIONS_MAX);
  if (error) throw new Error(`Kendi içerikler okunamadı: ${error.message}`);
  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const tag of rows.flatMap((row) => row.hashtags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const hashtags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
  return { captions: rows.flatMap((row) => (row.caption === null ? [] : [row.caption])), hashtags };
}

/** Adımın gerçek bağlaması: kendi metni okur, taslağı üretir, çağrıyı kaydeder. FIRLATMAZ. */
export async function draftNicheForAccount(ctx: IntelContext, profile: NicheDraftProfile, log: (line: string) => void, deps: { backend?: LlmBackend } = {}): Promise<NicheDraftResult> {
  try {
    const own = await loadOwnText(ctx);
    const result = await draftNiche(deps.backend ?? createLlmBackend(), { profile, ...own }, { model: lightModel() });
    if (result.meta !== undefined) await recordLlmRun(ctx.client, ctx.workspaceId, result.meta, NICHE_DRAFT_RUN_LABEL).catch((error: unknown) => log(`Uyarı: konu taslağı koşusu kaydedilemedi: ${error instanceof Error ? error.message : "bilinmeyen hata"}`));
    if (result.draft !== undefined) return { draft: result.draft };
    return { reason: result.reason, note: result.reason === "no_text" ? "Biyografi ve açıklama yok: konu taslağı çıkarılmadı (yazı aracı çağrılmadı)." : "Metin konuyu açıkça göstermiyor: konu taslağı boş bırakıldı." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "bilinmeyen hata";
    if (error instanceof LlmError) await recordFailedLlmRun(ctx.client, ctx.workspaceId, NICHE_DRAFT_KIND, NICHE_DRAFT_RUN_LABEL, `${error.code}: ${message}`).catch(() => undefined);
    log(`Konu taslağı çıkarılamadı: ${message}`);
    return { reason: "llm_failed", note: `Konu taslağı çıkarılamadı (${message}): boş bırakıldı.`, ...(isLlmUnavailableError(error) ? { persistent: true } : {}) };
  }
}
