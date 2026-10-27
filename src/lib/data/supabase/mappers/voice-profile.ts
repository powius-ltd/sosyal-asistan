/**
 * Ses profili satırı (`voice_profiles`) → `VoiceProfile`. jsonb alanları (`traits`, `lexicon`, `stats`) doğrulanır: biçimsiz
 * özellik atılır (kanıtsız özellik script'e girmez), biçimsiz `lexicon`/`stats` boş döner. Ölçülemeyen istatistik undefined (0 değil).
 */
import { z } from "zod";

import type { VoiceLexicon, VoiceProfile, VoiceStats, VoiceTrait } from "@/lib/domain/voice-profile";
import { emptyLexicon } from "@/lib/domain/voice-profile";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { iso, opt, stringList, validEntries } from "@/lib/data/supabase/mappers/common";

export const VOICE_PROFILE_COLUMNS =
  "id, workspace_id, social_account_id, platform, language, summary, traits, lexicon, stats, sample_size, taxonomy_version, prompt_version, model, generated_at" as const;

export type VoiceProfileRow = Pick<
  Tables<"voice_profiles">,
  | "id"
  | "workspace_id"
  | "social_account_id"
  | "platform"
  | "language"
  | "summary"
  | "traits"
  | "lexicon"
  | "stats"
  | "sample_size"
  | "taxonomy_version"
  | "prompt_version"
  | "model"
  | "generated_at"
>;

const traitSchema: z.ZodType<VoiceTrait> = z.object({
  key: z.string().min(1),
  label: z.string(),
  description: z.string(),
  verified: z.boolean(),
  examples: z.array(z.object({ contentItemId: z.string(), quote: z.string() })),
});

const STAT_FIELDS = {
  sampleSize: z.number().int().nonnegative(),
  medianCaptionChars: z.number().nonnegative().finite(),
  questionShare: z.number().min(0).max(1),
  emojiPerCaption: z.number().nonnegative().finite(),
  medianHashtagCount: z.number().nonnegative().finite(),
  secondPersonShare: z.number().min(0).max(1),
  avgSentenceWords: z.number().nonnegative().finite(),
  medianDurationSec: z.number().nonnegative().finite(),
} as const;

/** Derleme zamanı denetim: alan şemaları `VoiceStats` ile uyumlu kalır. */
export const VOICE_STATS_SCHEMA: z.ZodType<VoiceStats> = z.object(STAT_FIELDS).partial().extend({ sampleSize: STAT_FIELDS.sampleSize });

function isRecord(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

export function toVoiceStats(value: Json | null | undefined): VoiceStats {
  const stats: Record<string, unknown> = { sampleSize: 0 };
  if (!isRecord(value)) return stats as unknown as VoiceStats;
  for (const [key, schema] of Object.entries(STAT_FIELDS)) {
    const parsed = schema.safeParse(value[key]);
    if (parsed.success) stats[key] = parsed.data;
  }
  return stats as unknown as VoiceStats;
}

export function toVoiceLexicon(value: Json | null | undefined): VoiceLexicon {
  if (!isRecord(value)) return emptyLexicon();
  return { signaturePhrases: stringList(value.signaturePhrases), avoidPhrases: stringList(value.avoidPhrases) };
}

export function toVoiceProfile(row: VoiceProfileRow): VoiceProfile {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    accountId: row.social_account_id,
    platform: row.platform,
    language: opt(row.language),
    summary: row.summary,
    traits: validEntries<VoiceTrait>(row.traits, traitSchema),
    lexicon: toVoiceLexicon(row.lexicon),
    stats: toVoiceStats(row.stats),
    sampleSize: row.sample_size,
    taxonomyVersion: row.taxonomy_version,
    promptVersion: row.prompt_version,
    model: opt(row.model),
    generatedAt: iso(row.generated_at),
  };
}
