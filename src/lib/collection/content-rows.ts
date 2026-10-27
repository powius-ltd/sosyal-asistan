/**
 * Saf eşleme: `NormalizedContent` → `content_items` / `metric_snapshots` satırı (DB'ye dokunmaz).
 *
 * Kurallar:
 *  - Satırlar AÇIK izin listesiyle kurulur (ham nesne/`...item` yayılmaz): `ephemeralMediaUrl`, `transcript`,
 *    `ownerHandle` ve yorumcu/etiket kimlikleri satıra HİÇ geçemez. Medya dosyası/adresi saklanmaz.
 *  - Ölçülemeyen (undefined) alan NULL yazılır, 0 DEĞİL. `0` yalnız kaynak `0` verdiyse yazılır.
 *  - `is_pinned` yalnız `true` ya da NULL'dır (`false` yazılmaz: "sabit değil" bilinmiyor sayılır; baz çizgisi yalnız
 *    `is_pinned = true`'yu dışlar).
 *  - Sayaç sütunları (bigint) tam sayı ve ≥ 0 olmalı: bozuk tek değer bütün toplu yazımı düşürmesin diye NULL'a çevrilir.
 */
import "server-only";

import type { NormalizedContent } from "@/lib/platforms/types";
import type { ScoringOwner } from "@/lib/scoring/types";
import type { Database } from "@/lib/supabase/database.types";

export type ContentItemRow = Database["public"]["Tables"]["content_items"]["Insert"];
export type MetricSnapshotRow = Database["public"]["Tables"]["metric_snapshots"]["Insert"];

/** Tam sayı sayaç; sonlu değilse ya da negatifse NULL. */
export function toCount(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function toNonNegative(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** `owner` → sahip sütunları (kendi hesap XOR rakip; ikisi de her zaman yazılır, biri NULL). */
export function ownerColumns(owner: ScoringOwner): { social_account_id: string | null; competitor_id: string | null } {
  return {
    social_account_id: owner.kind === "own" ? owner.id : null,
    competitor_id: owner.kind === "competitor" ? owner.id : null,
  };
}

/** Sahip anahtarı (`own:<id>` / `competitor:<id>`): harita/küme anahtarı olarak. */
export function ownerKey(owner: ScoringOwner): string {
  return `${owner.kind}:${owner.id}`;
}

/** `content_items` satırı. Skor önbelleği sütunları YOKTUR (upsert onları ezmez; skoru `lib/scoring` yazar). */
export function toContentRow(item: NormalizedContent, owner: ScoringOwner, workspaceId: string): ContentItemRow {
  return {
    workspace_id: workspaceId,
    platform: item.platform,
    ...ownerColumns(owner),
    external_id: item.externalId,
    shortcode: item.shortcode ?? null,
    url: item.url ?? null,
    format: item.format,
    published_at: item.publishedAt ?? null,
    caption: item.caption ?? null,
    hashtags: [...item.hashtags],
    duration_sec: toNonNegative(item.durationSec),
    is_pinned: item.isPinned === true ? true : null,
    is_paid_partnership: typeof item.isPaidPartnership === "boolean" ? item.isPaidPartnership : null,
    // Ortak yazarların HERKESE AÇIK kullanıcı adları (keşif; kullanıcı kararı). Başka kimlik alanı yoktur; yoksa boş dizi.
    coauthors: [...(item.coauthors ?? [])],
    missing_fields: [...item.missingFields],
  };
}

export interface SnapshotContext {
  workspaceId: string;
  contentItemId: string;
  collectionRunId: string;
  /** Ölçüm anı (tek saat; ISO). */
  capturedAt: string;
  /** Bu ölçüm anındaki sahip takipçi sayısı; bilinmiyorsa undefined (NULL). */
  ownerFollowers?: number;
}

/** `metric_snapshots` satırı (`source = 'apify'`). */
export function toSnapshotRow(item: NormalizedContent, ctx: SnapshotContext): MetricSnapshotRow {
  const metrics = item.metrics;
  return {
    workspace_id: ctx.workspaceId,
    content_item_id: ctx.contentItemId,
    collection_run_id: ctx.collectionRunId,
    captured_at: ctx.capturedAt,
    views: toCount(metrics.views),
    views_kind: metrics.viewsKind ?? null,
    likes: toCount(metrics.likes),
    comments: toCount(metrics.comments),
    shares: toCount(metrics.shares),
    saves: toCount(metrics.saves),
    reach: toCount(metrics.reach),
    avg_watch_sec: toNonNegative(metrics.avgWatchSec),
    owner_followers: toCount(ctx.ownerFollowers),
    extra: { ...metrics.extra },
    source: "apify",
  };
}
