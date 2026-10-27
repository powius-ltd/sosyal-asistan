/**
 * Skor yeniden hesaplamanın satır tipleri ve DB erişim sözleşmesi (`ScoringStore`).
 *
 * Akış: DB satırları → `ScorableItem` (`to-scorable.ts`) → `scoreAccount` (`lib/metrics`) → skor sütunları
 * (`to-score-row.ts`) → toplu yazım. DB erişimi yalnız `ScoringStore` üzerindendir: Supabase uygulaması
 * `supabase-store.ts`, birim testlerinde sahte depo enjekte edilir.
 */
import type { BaselineExcludedCounts } from "@/lib/domain/content";
import type { Database } from "@/lib/supabase/database.types";

type ContentRow = Database["public"]["Tables"]["content_items"]["Row"];
type LatestMetricsViewRow = Database["public"]["Views"]["content_latest_metrics"]["Row"];

/** Skoru hesaplanan hesap: kendi hesap (`social_accounts.id`) ya da rakip (`competitors.id`). */
export interface ScoringOwner {
  kind: "own" | "competitor";
  id: string;
}

/**
 * Toplu yazımda (upsert) AYNEN geri yazılan kimlik sütunları. Upsert'in INSERT kolu NOT NULL ve sahip XOR
 * kısıtlarını geçmek zorundadır; bu yüzden okunan değerler değiştirilmeden geri gönderilir.
 */
export type ContentIdentity = Pick<
  ContentRow,
  "id" | "workspace_id" | "platform" | "external_id" | "format" | "social_account_id" | "competitor_id"
>;

/** Skorlama için okunan içerik sütunları: kimlik + baz çizgisi kuralları için yayın tarihi ve sabitlenme. */
export type ContentScoringRow = ContentIdentity & Pick<ContentRow, "published_at" | "is_pinned">;

/** `content_latest_metrics`'ten gereken alanlar (içerik başına EN SON ölçüm). */
export type LatestMetricsRow = Pick<LatestMetricsViewRow, "content_item_id" | "views" | "views_kind">;

/** `content_items.baseline_excluded` (jsonb): domain `BaselineExcludedCounts` adlarıyla. */
export type BaselineExcludedJson = { [K in keyof BaselineExcludedCounts]: number };

/** `content_items.baseline_basis` (jsonb) öğesi: `BaselineExplanation.basis` ile aynı şekil. */
export type BaselineBasisJson = { contentItemId: string; views: number; publishedAt: string };

/** `content_items` skor önbelleği sütunları. Hesaplanamayan değer NULL (0 değil). */
export type ScoreColumns = {
  views_kind: ContentRow["views_kind"];
  baseline_views: number | null;
  baseline_n: number | null;
  baseline_excluded: BaselineExcludedJson;
  baseline_basis: BaselineBasisJson[];
  lift: number | null;
  lift_tier: number | null;
  low_confidence: boolean;
  immature: boolean;
  cross_score: number | null;
  scored_at: string;
};

/** Toplu yazılan satır: kimlik (değişmeden) + skor sütunları. */
export type ScoreWriteRow = ContentIdentity & ScoreColumns;

/**
 * Skorlamanın DB erişim sözleşmesi. Her metot çalışma alanıyla süzer; N+1 yok (parça parça toplu okuma/yazma).
 */
export interface ScoringStore {
  /** Çalışma alanındaki tüm kendi hesaplar + `tracked` rakipler. */
  listOwners(wsId: string): Promise<ScoringOwner[]>;
  /** Sahibin tüm içerikleri (sayfalı okunur). */
  listOwnerContent(wsId: string, owner: ScoringOwner): Promise<ContentScoringRow[]>;
  /** İçerik kimliği → en son ölçüm (kimlik listesiyle parça parça). Hiç ölçülmemiş içerik ya yoktur ya alanları NULL'dır. */
  latestMetrics(wsId: string, contentIds: readonly string[]): Promise<Map<string, LatestMetricsRow>>;
  /** Sahibin en son BİLİNEN takipçi sayısı (`account_snapshots`, NULL olmayan en yeni); yoksa undefined. */
  latestFollowers(wsId: string, owner: ScoringOwner): Promise<number | undefined>;
  /** Skor sütunlarını toplu yazar (parça başına tek istek). */
  writeScores(rows: readonly ScoreWriteRow[]): Promise<void>;
}
