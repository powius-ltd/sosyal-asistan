/**
 * Workspace, kendi hesap ve rakip satırları → domain. Rakip özet istatistikleri (`followersDelta7d`, `medianViews`,
 * `outlierCount`, `postsPerWeek`) burada DEĞİL: toplanan içerikten ortak görünüm hesabıyla türetilir (`competitors.ts`).
 */
import type { Competitor, DiscoveryCandidateView, OwnAccount } from "@/lib/domain/competitor";
import { toAccountType } from "@/lib/domain/account-type";
import { toContentLanguage } from "@/lib/domain/content-language";
import type { Workspace } from "@/lib/domain/run";
import type { Tables } from "@/lib/supabase/database.types";
import { competitorSourceOf, competitorStatusOf, complianceRegionOf, connectionOf } from "@/lib/data/supabase/mappers/enums";
import { iso, isoOpt, opt } from "@/lib/data/supabase/mappers/common";

export const WORKSPACE_COLUMNS =
  "id, name, timezone, audience_timezone, niche_brief, apify_monthly_cap_usd, llm_monthly_cap_usd, measure_monthly_cap_usd, measure_cap_approved_at, agent_monthly_cap_usd, agent_cap_approved_at, collect_every_days, collect_video_limit, rival_target, compliance_region, content_language, account_type, created_at" as const;

export type WorkspaceRow = Pick<
  Tables<"workspaces">,
  | "id"
  | "name"
  | "timezone"
  | "audience_timezone"
  | "niche_brief"
  | "apify_monthly_cap_usd"
  | "llm_monthly_cap_usd"
  | "measure_monthly_cap_usd"
  | "measure_cap_approved_at"
  | "agent_monthly_cap_usd"
  | "agent_cap_approved_at"
  | "collect_every_days"
  | "collect_video_limit"
  | "rival_target"
  | "compliance_region"
  | "content_language"
  | "account_type"
  | "created_at"
>;

export function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    // `audience_timezone` NULL = belirtilmedi: workspace saat dilimi kullanılır (domain'de alan hep dolu).
    audienceTimeZone: row.audience_timezone ?? row.timezone,
    nicheBrief: opt(row.niche_brief),
    apifyMonthlyCapUsd: row.apify_monthly_cap_usd,
    llmMonthlyCapUsd: row.llm_monthly_cap_usd,
    // NULL = ölçüm tavanı ONAYSIZ (0 değil): ölçüm harcaması yapılamaz.
    measureMonthlyCapUsd: opt(row.measure_monthly_cap_usd),
    measureCapApprovedAt: isoOpt(row.measure_cap_approved_at),
    // NULL = ajan tavanı ONAYSIZ (0 değil): ajan para harcayamaz.
    agentMonthlyCapUsd: opt(row.agent_monthly_cap_usd),
    agentCapApprovedAt: isoOpt(row.agent_cap_approved_at),
    collectEveryDays: row.collect_every_days,
    collectVideoLimit: row.collect_video_limit,
    rivalTarget: row.rival_target,
    complianceRegion: complianceRegionOf(row.compliance_region),
    // NULL = ayarlanmadı (otomatik çözüm). DB kontrolü yalnız desteklenen dilleri kabul eder.
    contentLanguage: toContentLanguage(row.content_language),
    accountType: toAccountType(row.account_type),
    createdAt: iso(row.created_at),
  };
}

export const OWN_ACCOUNT_COLUMNS =
  "id, workspace_id, platform, handle, display_name, followers, avatar_url, connection, scopes, token_expires_at, last_synced_at, created_at" as const;

export type OwnAccountRow = Pick<
  Tables<"social_accounts">,
  | "id"
  | "workspace_id"
  | "platform"
  | "handle"
  | "display_name"
  | "followers"
  | "avatar_url"
  | "connection"
  | "scopes"
  | "token_expires_at"
  | "last_synced_at"
  | "created_at"
>;

export function toOwnAccount(row: OwnAccountRow): OwnAccount {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    handle: row.handle,
    displayName: opt(row.display_name),
    followers: opt(row.followers),
    avatarUrl: opt(row.avatar_url),
    connection: connectionOf(row.connection),
    scopes: row.scopes,
    tokenExpiresAt: isoOpt(row.token_expires_at),
    lastSyncedAt: isoOpt(row.last_synced_at),
    createdAt: iso(row.created_at),
  };
}

export const COMPETITOR_COLUMNS =
  "id, workspace_id, platform, handle, external_id, display_name, bio, followers, following, posts_count, is_verified, category, avatar_url, status, status_reason, source, discovered_via, missing_fields, last_collected_at, created_at" as const;

export type CompetitorRow = Pick<
  Tables<"competitors">,
  | "id"
  | "workspace_id"
  | "platform"
  | "handle"
  | "external_id"
  | "display_name"
  | "bio"
  | "followers"
  | "following"
  | "posts_count"
  | "is_verified"
  | "category"
  | "avatar_url"
  | "status"
  | "status_reason"
  | "source"
  | "discovered_via"
  | "missing_fields"
  | "last_collected_at"
  | "created_at"
>;

/** `contentCount` = rakibin toplanmış içerik sayısı (ölçülmüş sayaç: hiç içerik yoksa 0). */
export function toCompetitor(row: CompetitorRow, contentCount: number): Competitor {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    handle: row.handle,
    externalId: opt(row.external_id),
    displayName: opt(row.display_name),
    bio: opt(row.bio),
    followers: opt(row.followers),
    following: opt(row.following),
    postsCount: opt(row.posts_count),
    isVerified: opt(row.is_verified),
    category: opt(row.category),
    avatarUrl: opt(row.avatar_url),
    status: competitorStatusOf(row.status),
    statusReason: opt(row.status_reason),
    source: competitorSourceOf(row.source),
    discoveredVia: opt(row.discovered_via),
    missingFields: row.missing_fields,
    contentCount,
    addedAt: iso(row.created_at),
    lastCollectedAt: isoOpt(row.last_collected_at),
  };
}

/** Keşif satırı (`status = candidate`, `source ≠ manual`). `similarSize`: takipçi ±3x mı (undefined = karşılaştırılamadı). */
export function toDiscoveryView(row: CompetitorRow, similarSize: boolean | undefined): DiscoveryCandidateView {
  const source = competitorSourceOf(row.source);
  if (source === "manual") throw new Error("Şema/domain uyumsuzluğu: keşif adayı kaynağı manual olamaz.");
  return {
    competitorId: row.id,
    platform: row.platform,
    handle: row.handle,
    displayName: opt(row.display_name),
    followers: opt(row.followers),
    source,
    via: opt(row.discovered_via),
    similarSize,
    discoveredAt: iso(row.created_at),
  };
}
