/**
 * Yayın işi satırı → `PublishJob`. Farklı adlar: `scheduledFor` ← `scheduled_at`, `externalId` ← `published_external_id`,
 * `permalink` ← `published_permalink`, `error` ← `last_error`, `trial` ← `trial_enabled` + `trial_graduation`
 * (graduation NULL = trial yok → undefined).
 */
import { TRIAL_GRADUATIONS, type PublishJob, type TrialSettings } from "@/lib/domain/publish";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, isoOpt, opt } from "@/lib/data/supabase/mappers/common";
import { publishStatusOf } from "@/lib/data/supabase/mappers/enums";

export const PUBLISH_COLUMNS =
  "id, workspace_id, social_account_id, platform, idea_id, status, caption, media_path, cover_path, order_id, share_to_feed, scheduled_at, paid_partnership, ai_generated, advertiser_name, trial_enabled, trial_graduation, attempt_count, approved_by, approved_at, container_id, container_expires_at, published_external_id, published_permalink, last_error, created_at, updated_at" as const;

export type PublishRow = Pick<
  Tables<"publish_jobs">,
  | "id"
  | "workspace_id"
  | "social_account_id"
  | "platform"
  | "idea_id"
  | "status"
  | "caption"
  | "media_path"
  | "cover_path"
  | "order_id"
  | "share_to_feed"
  | "scheduled_at"
  | "paid_partnership"
  | "ai_generated"
  | "advertiser_name"
  | "trial_enabled"
  | "trial_graduation"
  | "attempt_count"
  | "approved_by"
  | "approved_at"
  | "container_id"
  | "container_expires_at"
  | "published_external_id"
  | "published_permalink"
  | "last_error"
  | "created_at"
  | "updated_at"
>;

function toTrial(row: Pick<PublishRow, "trial_enabled" | "trial_graduation">): TrialSettings | undefined {
  const graduation = TRIAL_GRADUATIONS.find((g) => g === row.trial_graduation);
  return graduation === undefined ? undefined : { enabled: row.trial_enabled, graduation };
}

export function toPublishJob(row: PublishRow): PublishJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    socialAccountId: row.social_account_id,
    platform: row.platform,
    ideaId: opt(row.idea_id),
    status: publishStatusOf(row.status),
    caption: opt(row.caption),
    mediaPath: opt(row.media_path),
    coverPath: opt(row.cover_path),
    orderId: opt(row.order_id),
    shareToFeed: row.share_to_feed,
    scheduledFor: isoOpt(row.scheduled_at),
    paidPartnership: row.paid_partnership,
    aiGenerated: row.ai_generated,
    advertiserName: opt(row.advertiser_name),
    trial: toTrial(row),
    approvedAt: isoOpt(row.approved_at),
    approvedBy: opt(row.approved_by),
    containerId: opt(row.container_id),
    containerExpiresAt: isoOpt(row.container_expires_at),
    externalId: opt(row.published_external_id),
    permalink: opt(row.published_permalink),
    error: opt(row.last_error),
    attemptCount: row.attempt_count,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
