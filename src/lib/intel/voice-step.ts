/**
 * Ses profili adımı: hesap için TAZE ve kullanılabilir (≥ 5 doğrulanmış özellik) profil varsa onu kullanır; yoksa kendi açıklama +
 * transcript'lerinden `buildVoiceProfile` (Claude CLI) ile üretip `voice_profiles`'a yazar (hesap başına tek güncel satır).
 *  - Taze: ≤ 14 gün önce üretilmiş, kullanılabilir ve profilden SONRA oluşmuş kendi transcript'i yok (yeni analiz profili bayatlatır).
 *  - Yeni üretim kullanılamazsa (< 5 doğrulanmış özellik) eski kullanılabilir profilin ÜZERİNE YAZILMAZ; eski profil yoksa kusurlu profil
 *    yine de yazılır (ekran "yetersiz" gösterir) ve plan üretimi script aşamasında durur.
 *  - Üretim LLM hatasıyla (`LlmError`: zaman aşımı, geçersiz çıktı, CLI) düşerse plan ÇÖKMEZ: elde kullanılabilir eski profil varsa o
 *    kullanılır (nota yazılır); yoksa profil yetersiz döner ve plan-run "ses profili kullanılamıyor" diye durur (hata notta).
 */
import "server-only";

import { TAXONOMY_VERSION } from "@/lib/domain/intel";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentLanguage } from "@/lib/domain/content-language";
import { isVoiceProfileUsable, type VoiceProfile, type VoiceStats } from "@/lib/domain/voice-profile";
import type { IntelContext } from "@/lib/intel/context";
import { contentText, type PlanSources } from "@/lib/intel/plan-corpus";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import type { Platform } from "@/lib/platforms/types";
import { buildVoiceProfile, type VoiceProfileDraft } from "@/lib/llm/voice-profile";
import { hasAnyText } from "@/lib/llm/content-text";
import { LlmError, type LlmBackend } from "@/lib/llm/types";
import type { Json } from "@/lib/supabase/database.types";
import { DAY_MS } from "@/lib/time";

export const VOICE_MAX_AGE_DAYS = 14;

export interface VoiceFreshnessInput {
  profile: Pick<VoiceProfile, "traits" | "generatedAt"> | null;
  now: Date;
  /** Kendi içeriklerinin transcript oluşma anları (ISO). */
  ownTranscriptTimes: readonly string[];
}

/** Profil olduğu gibi kullanılabilir mi (saf). */
export function isVoiceFresh(input: VoiceFreshnessInput): boolean {
  const { profile } = input;
  if (profile === null || !isVoiceProfileUsable(profile)) return false;
  const generated = Date.parse(profile.generatedAt);
  if (!Number.isFinite(generated) || input.now.getTime() - generated > VOICE_MAX_AGE_DAYS * DAY_MS) return false;
  return !input.ownTranscriptTimes.some((time) => Date.parse(time) > generated);
}

export interface VoiceStepInput {
  accountId: string;
  handle: string;
  /** Hesabın platformu (profil o platformun satırına yazılır); verilmezse eski davranış (Instagram). */
  platform?: Platform;
  /** Çalışma alanının içerik dili (`resolveContentLanguage`): ses profiline yazılır. */
  language: ContentLanguage;
  ownItems: readonly ContentItem[];
  src: PlanSources;
  /** Kendi hesabın ön istatistiği (LLM'siz, `getInsights` satırı); yoksa yalnız örnek sayısı. */
  stats?: VoiceStats;
  log: (line: string) => void;
}

export interface VoiceStepResult {
  profile: VoiceProfile | null;
  built: boolean;
  /** Bu adımda kaydedilen koşu kimliği (yeni üretildiyse). */
  runId?: string;
  notes: string[];
}

const asJson = (value: unknown): NonNullable<Json> => value as NonNullable<Json>;

export async function ensureVoiceProfile(ctx: IntelContext, llm: LlmBackend, input: VoiceStepInput): Promise<VoiceStepResult> {
  const existing = await ctx.repo.getVoiceProfile(ctx.workspaceId, input.accountId);
  const ownTranscriptTimes = input.ownItems.flatMap((item) => {
    const at = input.src.transcripts.get(item.id)?.createdAt;
    return at === undefined ? [] : [at];
  });
  if (isVoiceFresh({ profile: existing, now: ctx.now, ownTranscriptTimes })) {
    input.log("Ses profili taze; yeniden üretilmedi.");
    return { profile: existing, built: false, notes: [] };
  }

  const contents = input.ownItems.map((item) => contentText(item, input.src)).filter(hasAnyText);
  if (contents.length === 0) return { profile: existing, built: false, notes: ["Kendi içeriklerinde metin yok: ses profili üretilemedi."] };

  input.log(`Ses profili üretiliyor (${contents.length} kendi içerik)...`);
  let draft: VoiceProfileDraft;
  try {
    draft = await buildVoiceProfile(llm, { ownerHandle: input.handle, language: input.language, contents });
  } catch (error) {
    await recordFailedLlmRun(ctx.client, ctx.workspaceId, "llm_voice_profile", `@${input.handle}`, error instanceof Error ? error.message : "bilinmeyen hata");
    if (!(error instanceof LlmError)) throw error;
    const usable = isVoiceProfileUsable(existing);
    return {
      profile: existing,
      built: false,
      notes: [`Ses profili üretilemedi (${error.message})${usable ? `; önceki profil (${existing?.generatedAt.slice(0, 10)}) kullanıldı.` : "; kullanılabilir önceki profil yok."}`],
    };
  }
  const runId = await recordLlmRun(ctx.client, ctx.workspaceId, draft.meta, `@${input.handle} ses profili`, contents.length);
  const notes = draft.notes.map((note) => `Ses profili: ${note}`);

  if (!draft.usable && isVoiceProfileUsable(existing)) {
    notes.push(`Yeni ses profili yetersiz (${draft.verifiedTraitCount} doğrulanmış özellik); önceki kullanılabilir profil korundu.`);
    return { profile: existing, built: false, runId, notes };
  }

  const stats: VoiceStats = input.stats ?? { sampleSize: contents.length };
  const { error } = await ctx.client.from("voice_profiles").upsert(
    {
      workspace_id: ctx.workspaceId,
      social_account_id: input.accountId,
      platform: input.platform ?? "instagram",
      language: draft.language ?? null,
      summary: draft.summary,
      traits: asJson(draft.traits),
      lexicon: asJson(draft.lexicon),
      stats: asJson(stats),
      sample_size: draft.sampleSize,
      taxonomy_version: TAXONOMY_VERSION,
      prompt_version: draft.promptVersion,
      model: draft.meta.model ?? null,
      run_id: runId,
      generated_at: ctx.now.toISOString(),
    },
    { onConflict: "workspace_id,social_account_id" },
  );
  if (error) throw new Error(`Ses profili yazılamadı: ${error.message}`);
  const profile = await ctx.repo.getVoiceProfile(ctx.workspaceId, input.accountId);
  if (!draft.usable) notes.push(`Ses profili yetersiz: ${draft.verifiedTraitCount} doğrulanmış özellik (en az 5 gerekli).`);
  return { profile, built: true, runId, notes };
}
