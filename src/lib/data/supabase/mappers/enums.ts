/**
 * `text + check` sütunlarını domain birleşim tiplerine daraltır. DB check kısıtları aynı değerleri zorlar; buraya
 * düşen bilinmeyen değer bir şema/domain uyumsuzluğudur (migration eklenip domain güncellenmemiş): sessizce geçirmek
 * yerine açık hata verilir.
 */
import { COMPLIANCE_REGIONS, type ComplianceRegion } from "@/lib/domain/compliance";
import type { CompetitorSource, CompetitorStatus, OwnAccountConnection } from "@/lib/domain/competitor";
import { COMPETITOR_STATUSES } from "@/lib/domain/competitor";
import type { LiftTier } from "@/lib/domain/content";
import {
  ANALYSIS_BACKENDS,
  HOOK_SOURCES,
  IDEA_SOURCES,
  IDEA_STATUSES,
  type AnalysisBackend,
  type AnalysisStatus,
  type HookSource,
  type IdeaSource,
  type IdeaStatus,
  type TranscriptSource,
} from "@/lib/domain/intel";
import { CONFIDENCE_LEVELS, WEEKLY_PLAN_STATUSES, type ConfidenceLevel, type WeeklyPlanStatus } from "@/lib/domain/weekly-plan";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/domain/notification";
import { PUBLISH_STATUSES, type PublishStatus } from "@/lib/domain/publish";
import { RUN_BILLINGS, RUN_PURPOSES, RUN_STATUSES, type RunBilling, type RunKind, type RunProvider, type RunPurpose, type RunStatus } from "@/lib/domain/run";

function narrow<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Şema/domain uyumsuzluğu: bilinmeyen ${what} değeri "${value}".`);
}

const CONNECTIONS = ["scrape_only", "connected", "expired", "revoked"] as const satisfies readonly OwnAccountConnection[];
const COMPETITOR_SOURCES = ["manual", "related", "search"] as const satisfies readonly CompetitorSource[];
const RUN_PROVIDERS = ["apify", "anthropic", "deepgram", "openai", "graph_api", "claude_cli", "gemini"] as const satisfies readonly RunProvider[];
const ANALYSIS_STATUSES = ["ok", "failed", "insufficient_data"] as const satisfies readonly AnalysisStatus[];
const TRANSCRIPT_PROVIDERS = ["apify", "openai", "deepgram", "gemini", "manual", "claude_cli"] as const;

export const connectionOf = (value: string): OwnAccountConnection => narrow(value, CONNECTIONS, "bağlantı durumu");
export const competitorStatusOf = (value: string): CompetitorStatus => narrow(value, COMPETITOR_STATUSES, "rakip durumu");
export const competitorSourceOf = (value: string): CompetitorSource => narrow(value, COMPETITOR_SOURCES, "rakip kaynağı");
export const ideaStatusOf = (value: string): IdeaStatus => narrow(value, IDEA_STATUSES, "fikir durumu");
export const publishStatusOf = (value: string): PublishStatus => narrow(value, PUBLISH_STATUSES, "yayın durumu");
export const runStatusOf = (value: string): RunStatus => narrow(value, RUN_STATUSES, "koşu durumu");
export const runProviderOf = (value: string): RunProvider => narrow(value, RUN_PROVIDERS, "koşu sağlayıcısı");
export const runBillingOf = (value: string): RunBilling => narrow(value, RUN_BILLINGS, "faturalama biçimi");
export const runPurposeOf = (value: string): RunPurpose => narrow(value, RUN_PURPOSES, "koşu amacı");
export const notificationKindOf = (value: string): NotificationKind => narrow(value, NOTIFICATION_KINDS, "bildirim türü");
export const analysisStatusOf = (value: string): AnalysisStatus => narrow(value, ANALYSIS_STATUSES, "analiz durumu");
export const complianceRegionOf = (value: string): ComplianceRegion => narrow(value, COMPLIANCE_REGIONS, "uyum bölgesi");
export const hookSourceOf = (value: string): HookSource => narrow(value, HOOK_SOURCES, "hook kaynağı");
export const analysisBackendOf = (value: string): AnalysisBackend => narrow(value, ANALYSIS_BACKENDS, "analiz arka ucu");
export const ideaSourceOf = (value: string): IdeaSource => narrow(value, IDEA_SOURCES, "fikir kaynağı");
export const weeklyPlanStatusOf = (value: string): WeeklyPlanStatus => narrow(value, WEEKLY_PLAN_STATUSES, "plan durumu");
export const confidenceOf = (value: string): ConfidenceLevel => narrow(value, CONFIDENCE_LEVELS, "güven düzeyi");

/**
 * Koşu türü: DB yalnız biçimi doğrular (`^[a-z][a-z0-9_]{1,40}$`; yeni tür migration istemesin diye). Bilinen türler
 * `RunKind` birleşimindedir; yenisi gelirse etiket haritası (UI) ona kadar ham metni gösterir — bu yüzden dar tipe
 * yalnız tip düzeyinde çevrilir.
 */
export const runKindOf = (value: string): RunKind => value as RunKind;

/** DB `transcripts.provider` → domain `Transcript.source` (`openai` ↔ `openai_stt`). */
export function transcriptSourceOf(provider: string): TranscriptSource {
  const value = narrow(provider, TRANSCRIPT_PROVIDERS, "transcript sağlayıcısı");
  return value === "openai" ? "openai_stt" : value;
}

/** `lift_tier` (smallint 0..4) → `LiftTier`; NULL = ölçülemedi. */
export function liftTierOf(value: number | null): LiftTier | undefined {
  if (value === null) return undefined;
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) return value;
  throw new Error(`Şema/domain uyumsuzluğu: lift kademesi ${value}.`);
}
