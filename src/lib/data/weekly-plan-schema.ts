/**
 * Haftalık plan bölümlerinin (`weekly_plans.sections` jsonb) zod şemaları — TEK tanım. Okuma tarafı (Supabase deposu)
 * kayıtlı bölümü doğrular; yazan taraf (`lib/intel` plan üretimi) `save_weekly_plan` RPC'sine göndermeden ÖNCE aynı şemayla
 * doğrular. Tip uyumu derleme zamanında denetlenir (`z.ZodType<…>` ataması): domain tipi değişirse burası kırılır.
 */
import { z } from "zod";

import { CONFIDENCE_LEVELS, emptyPlanSections, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";

const confidence = z.enum(CONFIDENCE_LEVELS as [string, ...string[]]) as z.ZodType<"high" | "medium" | "low">;
const nonNegative = z.number().nonnegative().finite();
const focusGroup = z.enum(["hook_type", "duration_bucket", "cta_type", "topic_cluster"]);

const quote = z.object({ contentItemId: z.string(), ownerHandle: z.string().optional(), text: z.string() });

const winner = z.object({
  contentItemId: z.string(),
  ownerHandle: z.string(),
  isOwn: z.boolean(),
  lift: nonNegative,
  views: nonNegative.optional(),
  publishedAt: z.string().optional(),
  durationSec: nonNegative.optional(),
  hookType: z.string().optional(),
  analyzed: z.boolean(),
  evidenceUnverified: z.boolean().optional(),
  why: z.string().optional(),
  quote: quote.optional(),
});

const direction = z.object({
  group: focusGroup,
  value: z.string(),
  label: z.string(),
  impact: nonNegative.optional(),
  novelty: nonNegative,
  score: nonNegative,
  sampleSize: z.number().int().nonnegative(),
  confidence,
  ownTried: z.boolean(),
  rationale: z.string().optional(),
  rationaleQuote: quote.optional(),
  evidenceContentIds: z.array(z.string()),
});

const slot = z.object({
  position: z.number().int().min(1).max(7),
  at: z.string(),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  basis: z.enum(["own_best", "own_good", "rival_fixed", "rival_common", "default"]),
  note: z.string().optional(),
  ideaId: z.string().optional(),
});

const avoidEntry = z.object({
  kind: z.enum(["low_lift", "off_niche"]),
  group: z.union([focusGroup, z.literal("off_niche")]),
  value: z.string(),
  label: z.string(),
  medianLift: nonNegative.optional(),
  sampleSize: z.number().int().nonnegative(),
  confidence,
  reason: z.string(),
});

export const WEEKLY_PLAN_SECTIONS_SCHEMA: z.ZodType<WeeklyPlanSections> = z.object({
  winners: z.object({
    rivals: z.array(winner),
    own: z.array(winner),
    relaxedThreshold: z.boolean(),
    unmeasuredReason: z.string().optional(),
  }),
  focus: z.object({ directions: z.array(direction), unmeasuredReason: z.string().optional() }),
  schedule: z.object({
    postsPerWeek: z.number().int().nonnegative(),
    audienceTimeZone: z.string(),
    slots: z.array(slot),
    rivalMedianPostsPerWeek: nonNegative.optional(),
    unmeasuredReason: z.string().optional(),
  }),
  avoid: z.object({ entries: z.array(avoidEntry) }),
  review: z.object({ status: z.enum(["awaiting_publish_data", "available"]), note: z.string().optional() }),
});

/**
 * Kayıtlı bölümleri doğrular. Bölüm bölüm okunur: biçimsiz bir bölüm yalnız kendi yerine boş bölüm bırakır (diğer bölümler
 * ekrana gelir; bozuk kayıt sayfayı düşürmez). Hiçbiri geçerli değilse `emptyPlanSections()`.
 */
export function parsePlanSections(value: unknown): WeeklyPlanSections {
  const fallback = emptyPlanSections();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof WeeklyPlanSections)[]) {
    const candidate = { ...fallback, [key]: raw[key] };
    if (WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(candidate).success) merged[key] = raw[key];
  }
  return merged as unknown as WeeklyPlanSections;
}

/** `weekly_plans.brief` jsonb biçim sürümü (brif alanları değişirse artar; okuyan eski sürümü ARTIK tanımaz → brif yok sayılır). */
export const PLAN_BRIEF_SCHEMA_VERSION = 1;

/**
 * Kayıtlı Kreatif direktör brifi: denetimden geçmiş `CreativeBrief`'in tamamı + biçim sürümü. Tip uyumu derleme zamanında denetlenir
 * (`z.ZodType<CreativeBrief>`): brif tipi değişirse burası kırılır. Enum değerleri `llm/creative-brief-schema.ts`'tekilerle aynıdır
 * (o dosya yalnız sunucuda yüklenir: burada tipi içe aktarılır, değerler yinelenir ve tip denetimi eşitliği tutar).
 */
const briefSlot = z.object({
  slotId: z.string().regex(/^S[1-9]$/),
  decision: z.enum(["adapt", "test"]),
  pillar: z.string(),
  testValue: z.string().optional(),
  why: z.string(),
  evidenceRef: z.string(),
  evidenceLabel: z.string(),
});

const PLAN_BRIEF_SCHEMA: z.ZodType<CreativeBrief> = z.object({
  theme: z.string(),
  pillars: z.array(z.object({ pillar: z.string(), slots: z.number().int().nonnegative() })),
  ratio: z.object({ adapt: z.number().nonnegative(), test: z.number().nonnegative() }),
  testVariable: z.object({ kind: z.enum(["hook_type", "duration", "format", "cta", "topic"]), value: z.string(), why: z.string() }),
  continuity: z.object({ mode: z.enum(["continue", "break", "first_week"]), note: z.string() }),
  slots: z.array(briefSlot),
  evidenceThin: z.boolean(),
});

/** RPC yüküne giden `brief` değeri (sürümlü). */
export function planBriefToStorage(brief: CreativeBrief): CreativeBrief & { schemaVersion: number } {
  return { schemaVersion: PLAN_BRIEF_SCHEMA_VERSION, ...PLAN_BRIEF_SCHEMA.parse(brief) };
}

/**
 * Kayıtlı brifi okur. NULL (brifsiz / eski plan), bilinmeyen sürüm ya da bozuk kayıt → undefined (brif yok; plan sayfayı düşürmez).
 */
export function parsePlanBrief(value: unknown): CreativeBrief | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { schemaVersion, ...rest } = value as Record<string, unknown>;
  if (schemaVersion !== PLAN_BRIEF_SCHEMA_VERSION) return undefined;
  const parsed = PLAN_BRIEF_SCHEMA.safeParse(rest);
  return parsed.success ? parsed.data : undefined;
}
