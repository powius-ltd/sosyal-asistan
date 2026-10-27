/**
 * İşçinin koşturduğu işlevler (enjekte edilir): gerçek bağlama `real-deps.ts`'te, testler SAHTESİNİ verir. İşçi yalnız mevcut `runX`
 * işlevlerini çağırır; burada iş mantığı yoktur. Para / kota harcayan her çağrı bu arayüzden geçer (testte casusla sayılır).
 */
import "server-only";

import type { CollectOptions } from "@/lib/collection/collect-once";
import type { DiscoverOptions, DiscoverSummary } from "@/lib/collection/discover";
import type { AccountVerification, VerifyAccountOptions } from "@/lib/collection/discover-account";
import type { CollectSummary } from "@/lib/collection/types";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { AnalyzeArgs, PlanArgs } from "@/lib/intel/args";
import type { BriefingRunResult } from "@/lib/intel/briefing-run";
import type { IntelContext } from "@/lib/intel/context";
import type { HousekeepingContext } from "@/lib/intel/housekeeping";
import type { LabelArgs } from "@/lib/intel/label-args";
import type { LabelSummary } from "@/lib/intel/label-run";
import type { ClusterOnlyResult, PlanRunResult } from "@/lib/intel/plan-run";
import type { NicheDraftProfile, NicheDraftResult } from "@/lib/job-runner/run-onboarding-niche";
import type { JobSpend } from "@/lib/job-runner/run-onboarding-settle";
import type { RoutineDeps } from "@/lib/orchestrator/routine";
import type { RoutineWiring } from "@/lib/orchestrator/steps";
import type { MeasureOptions, MeasureResult } from "@/lib/outcomes/measure-run";
import type { OrderReturnRun, PublishRun } from "@/lib/publish/real-run";
import type { OrderRunResult } from "@/lib/studio-order/run";
import type { ZernioJobResult } from "@/lib/outcomes/zernio-job";

export type Log = (line: string) => void;

export interface JobRunnerDeps {
  /** İşin çalışma alanı bağlamı (`createIntelContext`): kimlik satırdan gelir, komut satırından / ortamdan DEĞİL. */
  createContext(now: Date, workspaceId: string): Promise<IntelContext>;
  /** Eksik ortam değişkenlerinin ADLARI (değer asla). */
  missingEnv(names: readonly string[]): string[];
  /** Betik başı bakımı (süresi dolan transcript, kapanmamış eski koşu). Önizlemede ÇAĞRILMAZ. */
  housekeeping(ctx: HousekeepingContext, log: Log): Promise<void>;
  /** PARA: `collectOnce`. Gerçek koşuda `maxUsd` her zaman satırdaki onaylı tutardır. */
  collect(options: CollectOptions): Promise<CollectSummary>;
  /** PARA: `measureOnce`. */
  measure(options: MeasureOptions): Promise<MeasureResult>;
  analyze(ctx: IntelContext, args: AnalyzeArgs, log: Log): Promise<AnalyzeSummary>;
  label(ctx: IntelContext, args: LabelArgs, log: Log): Promise<LabelSummary>;
  plan(ctx: IntelContext, args: PlanArgs, log: Log): Promise<PlanRunResult>;
  briefing(ctx: IntelContext, options: { log: Log }): Promise<BriefingRunResult>;
  cluster(ctx: IntelContext, log: Log): Promise<ClusterOnlyResult>;
  /** Haftalık turun gerçek bağlaması (`createRoutineDeps`): işçi adımlarını sarar, yeniden yazmaz. */
  routineDeps(ctx: IntelContext, wiring: RoutineWiring): RoutineDeps;
  /** Toplamanın tarayacağı hesap sayısı (kendi + izlenen rakipler; yalnız OKUR). Tur önizlemesinin kredi tahmini için. */
  collectTargetCount(ctx: IntelContext): Promise<number>;
  /** Plan çıktısını `docs/haftalik-plan/<slug>/` altına yazar; yazılan yol, yazılamadıysa undefined. */
  writePlanMarkdown(ctx: IntelContext, result: PlanRunResult): string | undefined;
  /** PARA (başlangıç `verify`): kendi hesabın profiline tek bakış (`verifyOwnAccount`). `maxUsd` satırdaki onaydan KALAN tutardır. */
  verifyAccount(options: VerifyAccountOptions): Promise<AccountVerification>;
  /** PARA (başlangıç `discover`): rakip adayı keşfi (`discoverCandidates`); ücretli çağrılar `maxUsd` içinde kalır, aday izlemeye alınmaz. */
  discover(options: DiscoverOptions): Promise<DiscoverSummary>;
  /** Halka: Zernio'dan kendi Reels sayıları (salt okunur, $0). Anahtar yoksa `key_missing` (çağrı yapılmaz). */
  measureZernio(ctx: IntelContext, options: { dryRun: boolean; log: Log }): Promise<ZernioJobResult>;
  /** Stüdyo siparişi: plan öğelerinden fiş dosyası yazar (dosya, $0). Aynı kimlikli fişin üstüne yazmaz. */
  writeOrders(ctx: IntelContext, options: { week: string; slot?: string; ideaId?: string; log: Log }): Promise<OrderRunResult>;
  /** Dönüş: stüdyodan dönen videoları onay bekleyen yayın satırına çevirir (satır + bildirim, $0). */
  returnOrders(ctx: IntelContext, options: { log: Log }): Promise<OrderReturnRun>;
  /** Yayın: YALNIZ onaylı stüdyo satırını zamanlar / yayınlananı kapatır ($0). Anahtar yoksa `key_missing` (çağrı yok). */
  publishOrders(ctx: IntelContext, options: { log: Log }): Promise<PublishRun>;
  /** Başlangıç `draft_niche`: tek hafif yazı çağrısıyla konu taslağı. FIRLATMAZ: çıkarılamazsa `draft` yoktur. */
  draftNiche(ctx: IntelContext, profile: NicheDraftProfile, log: Log): Promise<NicheDraftResult>;
  /** İşin açtığı koşuların mutabakatı (sınırlı bekleme) + toplam tutarı; iş sonunda bir kez. Para harcamaz. */
  settleSpend(ctx: IntelContext, jobId: string, options: { log: Log; shouldStop?: () => boolean; waitMs?: number }): Promise<JobSpend>;
}
