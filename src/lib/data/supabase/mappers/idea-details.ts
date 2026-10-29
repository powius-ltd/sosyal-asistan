/**
 * `ideas.details` (jsonb) → `IdeaDetails`. Alanlar tek tek doğrulanır: biçimsiz alan atılır, diğerleri kalır (bozuk tek alan
 * kartın tamamını düşürmez; kanıtsız/biçimsiz değer ekrana taşınmaz). Yazan sunucu (`save_weekly_plan`), okuyan depo.
 */
import { z } from "zod";

import { SCRIPT_CLAIM_VERDICTS, type IdeaDetails } from "@/lib/domain/intel";
import { CTA_TYPES, DURATION_BUCKETS, IDEA_FRAMES } from "@/lib/domain/taxonomy";
import type { Json } from "@/lib/supabase/database.types";

const QUOTE = z.object({ contentItemId: z.string(), ownerHandle: z.string().optional(), text: z.string() });

const SCRIPT_REVIEW = z.object({
  revised: z.boolean(),
  originalScript: z.string().optional(),
  changes: z.array(z.string()),
  claims: z.array(z.object({ text: z.string(), verdict: z.enum(SCRIPT_CLAIM_VERDICTS), note: z.string() })),
  corrections: z.number().int().nonnegative(),
  verifyBeforePublish: z.array(z.string()),
  promptVersion: z.string(),
});

const REVISION = z.object({
  at: z.string(),
  request: z.string(),
  hooks: z.array(z.string()),
  hookTypes: z.array(z.string()).optional(),
  scriptOutline: z.array(z.string()),
  script: z.string().optional(),
});

const FIELDS = {
  topic: z.string(),
  frame: z.enum(IDEA_FRAMES),
  ctaType: z.enum(CTA_TYPES),
  targetDurationSec: z.number().nonnegative().finite(),
  durationBucket: z.enum(DURATION_BUCKETS),
  script: z.string(),
  scriptLanguage: z.string(),
  captionDraft: z.string(),
  hookTypes: z.array(z.string()),
  quotes: z.array(QUOTE),
  personalQuotes: z.array(QUOTE),
  voiceTraitKeys: z.array(z.string()),
  ownTried: z.boolean(),
  maxSharedWords: z.number().int().nonnegative(),
  scriptReview: SCRIPT_REVIEW,
  revisions: z.array(REVISION),
} as const;

/** Derleme zamanı denetim: alan şemaları `IdeaDetails` ile uyumlu kalır (biri değişirse burada kırılır). */
export const IDEA_DETAILS_SCHEMA: z.ZodType<IdeaDetails> = z.object(FIELDS).partial();

export function toIdeaDetails(value: Json | null | undefined): IdeaDetails {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, Json | undefined>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(FIELDS)) {
    const entry = raw[key];
    if (entry === undefined || entry === null) continue;
    const parsed = schema.safeParse(entry);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as IdeaDetails;
}
