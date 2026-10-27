/**
 * Toplama katmanının ortak tipleri: hedef, plan, rapor ve test için enjekte edilebilir bağımlılıklar.
 * Bağımlılıkların varsayılanı gerçek modüllerdir (`deps.ts`); yalnız testler bunları değiştirir.
 */
import "server-only";

import type { BudgetDeps, CollectionRunRow } from "@/lib/apify/budget";
import type { ReconcileResult } from "@/lib/apify/reconcile";
import type { BudgetedRun, BudgetedRunRequest } from "@/lib/apify/start";
import type { WaitForRunResult } from "@/lib/apify/wait-for-run";
import type { ProfileAccessState } from "@/lib/collection/profile-rows";
import type { CostEstimate } from "@/lib/apify/pricing";
import type { RunPurpose } from "@/lib/domain/run";
import type { AfterCollectSummary } from "@/lib/collection/after-collect";
import type { Platform, ScrapeJobSpec } from "@/lib/platforms/types";
import type { WorkspaceScoresResult } from "@/lib/scoring";
import type { ScoringOwner } from "@/lib/scoring/types";
import type { AdminClient } from "@/lib/supabase/admin";

/** Toplanacak hesap: kendi hesap ya da `tracked` rakip. */
export interface CollectTarget {
  owner: ScoringOwner;
  handle: string;
  platform: Platform;
}

export interface PlannedJob {
  /** Koşu kaydındaki etiket (`target_label`): `@ad` ya da `profil (4 hesap)`. */
  label: string;
  spec: ScrapeJobSpec;
  /** Bu koşunun kapsadığı hedefler (profil koşusunda hepsi, reel koşusunda tek). */
  targets: CollectTarget[];
  estimatedUsd: number;
  priceUnknown: boolean;
}

export interface CollectPlan {
  jobs: PlannedJob[];
  /** Tüm koşuların tahmini toplamı (USD, 6 ondalık). */
  estimatedUsd: number;
  /** Harcama tavanı (USD); toplam tahmin bunu aşarsa HİÇBİR koşu başlamaz. */
  maxUsd: number;
  withinCeiling: boolean;
  /** En az bir aktörün fiyatı okunamadı (tahmin muhafazakâr varsayımdan). */
  priceUnknown: boolean;
}

export interface TargetReport {
  handle: string;
  kind: ScoringOwner["kind"];
  profile?: { state: ProfileAccessState; reason?: string; followers?: number };
  /** Rakip durumu koşu sonucunda değiştiyse yeni durum. */
  statusChanged?: "private" | "not_found";
  content?: {
    /** Ayrıştırılan öğe sayısı (koşunun döndürdüğü gerçek içerik). */
    parsed: number;
    /** `content_items`'a yazılan. */
    ingested: number;
    /** `metric_snapshots`'a yazılan. */
    snapshots: number;
    /** Kaynağın öğe saymadığı satırlar (hata satırı, boş zarf). */
    notItems: number;
    /** Başka hesaba ait / başka sahibe kayıtlı olduğu için atlanan. */
    skipped: number;
    accessError?: string;
    /** Koşu ya da ingest hatası; alanlar boşsa koşu yapılmadı (`skippedReason`). */
    error?: string;
    skippedReason?: string;
  };
}

export interface RunReport {
  runId: string;
  kind: string;
  label: string;
  status: string;
  reservedUsd: number;
  /** undefined = mutabakat bekliyor (0 DEĞİL). */
  actualUsd?: number;
  itemCount?: number;
}

export type CollectOutcome = "completed" | "dry_run" | "blocked" | "no_targets";

export interface CollectSummary {
  outcome: CollectOutcome;
  plan?: CollectPlan;
  targets: TargetReport[];
  runs: RunReport[];
  scoring?: { items: number; owners: number; failures: { owner: string; message: string }[] };
  cost: { reservedUsd: number; actualUsd?: number; pendingReconcile: number };
  /** Toplama sonrası döngü işleri (bağ çözümü, öneri, ölçüm bildirimi); koşu tamamlandıysa dolu. */
  afterCollect?: AfterCollectSummary;
  /** Uyarılar ve durdurma sebepleri (Türkçe, gizli değer içermez). */
  notes: string[];
}

/** Test için değiştirilebilen bağımlılıklar; varsayılanlar `deps.ts`'te. */
export interface CollectDeps {
  client?: AdminClient;
  estimate?: (actorId: string, expectedResults: number) => Promise<CostEstimate>;
  start?: (request: BudgetedRunRequest, deps: BudgetDeps) => Promise<BudgetedRun>;
  wait?: (runId: string) => Promise<WaitForRunResult>;
  datasetItems?: (datasetId: string) => Promise<unknown[]>;
  reconcile?: (runId: string, deps: BudgetDeps) => Promise<ReconcileResult>;
  /** Gerçek saat: koşu yaşam döngüsü damgaları (`finished_at`) ve bekleme süreleri. Ölçüm/skor saati `now`'dır. */
  clock?: () => Date;
  recompute?: (workspaceId: string, now: Date) => Promise<WorkspaceScoresResult>;
  sleep?: (ms: number) => Promise<void>;
  /** Toplama sonrası döngü işleri (bağ çözümü → öneri → ölçüm bildirimi); testler sahtesini verir. */
  afterCollect?: (client: AdminClient, workspaceId: string, now: Date) => Promise<AfterCollectSummary>;
}

export type ResolvedDeps = Required<CollectDeps>;

/**
 * Mutabakat bekleyen koşu. Oturma durumu (geçici/kesin tutar, yaş, ardışık okuma) DB'dedir (`collection_runs.actual_usd` +
 * `usage_settled_at`) ve `reconcileRun` tarafından yönetilir; burada yalnız hangi koşuların tekrar denendiği tutulur.
 */
export interface PendingRun {
  externalRunId: string;
}

/** Bir toplama turunun paylaşılan bağlamı (koşu yürütücüleri ve aşamalar bunu alır). */
export interface CollectContext {
  workspaceId: string;
  now: Date;
  /** Koşuların amacı (`measurement` = Reels ölçümü); koşu kaydına `purpose` olarak yazılır. */
  purpose?: RunPurpose;
  deps: ResolvedDeps;
  log: (line: string) => void;
  /** Bu turda açılan koşu kimlikleri (rapor ve mutabakat için). */
  runIds: string[];
  /** Apify'a gitmiş, gerçek tutarı henüz yazılmamış koşular (koşu kimliği → mutabakat durumu). */
  pending: Map<string, PendingRun>;
  notes: string[];
  /** Tavan/yapılandırma hatası: kalan koşular başlatılmaz. */
  stop?: string;
  /** Sahip → bilinen takipçi sayısı (profil aşamasından; içerik ölçümüne `owner_followers` olarak yazılır). */
  followers: Map<string, number>;
}

export type { CollectionRunRow };
