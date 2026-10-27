/**
 * Bildirim ve uyarı ayarı satırları → domain. SIR YOK: Telegram bot anahtarı/sohbet kimliği tabloya girmez (Vault);
 * Faz 1'de sohbet bağlama akışı olmadığından `chatIdSet` her zaman false'tur (Vault'ta sır varlığı F2/F3'te okunur).
 */
import { DEFAULT_ALERT_SETTINGS, type AlertSettings, type AlertTier, type Notification } from "@/lib/domain/notification";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, isoOpt, opt } from "@/lib/data/supabase/mappers/common";
import { notificationKindOf } from "@/lib/data/supabase/mappers/enums";

export const NOTIFICATION_COLUMNS = "id, workspace_id, kind, title, body, content_item_id, created_at, read_at" as const;
export type NotificationRow = Pick<Tables<"notifications">, "id" | "workspace_id" | "kind" | "title" | "body" | "content_item_id" | "created_at" | "read_at">;

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: notificationKindOf(row.kind),
    title: row.title,
    body: row.body,
    contentId: opt(row.content_item_id),
    createdAt: iso(row.created_at),
    readAt: isoOpt(row.read_at),
  };
}

export const ALERT_COLUMNS =
  "workspace_id, competitor_outlier_enabled, competitor_outlier_min_tier, own_outlier_enabled, own_outlier_min_tier, weekly_digest_enabled, weekly_digest_weekday, weekly_digest_hour, email_enabled, email_address, telegram_enabled" as const;
export type AlertRow = Pick<
  Tables<"alert_settings">,
  | "workspace_id"
  | "competitor_outlier_enabled"
  | "competitor_outlier_min_tier"
  | "own_outlier_enabled"
  | "own_outlier_min_tier"
  | "weekly_digest_enabled"
  | "weekly_digest_weekday"
  | "weekly_digest_hour"
  | "email_enabled"
  | "email_address"
  | "telegram_enabled"
>;

function tier(value: number): AlertTier {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  throw new Error(`Şema/domain uyumsuzluğu: uyarı kademesi ${value}.`);
}

/** Satır yoksa varsayılan ayarlar (`DEFAULT_ALERT_SETTINGS`; tablo varsayılanlarıyla aynı). */
export function toAlertSettings(row: AlertRow | null): AlertSettings {
  if (!row) return structuredClone(DEFAULT_ALERT_SETTINGS);
  return {
    competitorOutlier: { enabled: row.competitor_outlier_enabled, minTier: tier(row.competitor_outlier_min_tier) },
    ownOutlier: { enabled: row.own_outlier_enabled, minTier: tier(row.own_outlier_min_tier) },
    weeklyDigest: { enabled: row.weekly_digest_enabled, weekday: row.weekly_digest_weekday, hour: row.weekly_digest_hour },
    channels: {
      inApp: true,
      email: { enabled: row.email_enabled, ...(row.email_address ? { address: row.email_address } : {}) },
      telegram: { enabled: row.telegram_enabled, chatIdSet: false },
    },
  };
}

/** Ayarlar → satır (upsert). E-posta adresi yoksa NULL. */
export function toAlertColumns(settings: AlertSettings): Omit<AlertRow, "workspace_id"> {
  return {
    competitor_outlier_enabled: settings.competitorOutlier.enabled,
    competitor_outlier_min_tier: settings.competitorOutlier.minTier,
    own_outlier_enabled: settings.ownOutlier.enabled,
    own_outlier_min_tier: settings.ownOutlier.minTier,
    weekly_digest_enabled: settings.weeklyDigest.enabled,
    weekly_digest_weekday: settings.weeklyDigest.weekday,
    weekly_digest_hour: settings.weeklyDigest.hour,
    email_enabled: settings.channels.email?.enabled ?? false,
    email_address: settings.channels.email?.address ?? null,
    telegram_enabled: settings.channels.telegram?.enabled ?? false,
  };
}
