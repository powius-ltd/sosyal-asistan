/**
 * Tek seferlik gerçek veri toplama (yerel/CLI): bir çalışma alanının kendi hesapları + `tracked` rakipleri için
 *   (1) platform başına TEK profil koşusu, (2) hedef başına reel koşusu → DB → skor önbelleği yeniden hesaplama.
 *
 * Harcama tavanı: koşulardan ÖNCE tüm tahmin hesaplanır; toplam `maxUsd`'yi (varsayılan $0,20 — kullanıcı onayı)
 * aşarsa HİÇBİR koşu başlatılmaz (`outcome: "blocked"`). `dryRun`: yalnız plan + tahmin (para harcanmaz).
 * Bir hedef başarısız olursa diğerleri sürer; yalnız bütçe tavanı/Apify yapılandırma hatası kalanları durdurur.
 * Fonksiyon beklenen hedef/koşu hatalarında fırlatmaz, özet döner; yalnız hedef listesi/plan okunamazsa fırlatır.
 */
import "server-only";

import { collectContent } from "@/lib/collection/collect-content";
import { collectProfiles } from "@/lib/collection/collect-profiles";
import { ownerKey } from "@/lib/collection/content-rows";
import { resolveDeps } from "@/lib/collection/deps";
import { buildPlan, DEFAULT_CONTENT_LIMIT, DEFAULT_MAX_USD } from "@/lib/collection/plan";
import { readRunReports, settleReconciliation } from "@/lib/collection/run-report";
import { loadTargets } from "@/lib/collection/targets";
import type { CollectContext, CollectDeps, CollectSummary, TargetReport } from "@/lib/collection/types";
import type { RunPurpose } from "@/lib/domain/run";
import { formatUsd } from "@/lib/format";

export interface CollectOptions {
  workspaceId: string;
  /** Hedef başına çekilecek son reel sayısı (varsayılan 10). */
  limit?: number;
  /** Toplam harcama tavanı (USD; varsayılan 0,20). */
  maxUsd?: number;
  /** true: yalnız plan + tahmin; hiçbir koşu başlatılmaz. */
  dryRun?: boolean;
  /** true: yalnız kendi hesaplar (rakip koşusu yok); ölçüm koşusu bunu kullanır. */
  ownOnly?: boolean;
  /** Yalnız bu andan yeni içerik (ISO; aktör `onlyPostsNewerThan`). */
  newerThan?: string;
  /** Koşuların amacı (`measurement`: `collection_runs.purpose`, aylık ölçüm tavanına sayılır). */
  purpose?: RunPurpose;
  /** Tek saat: ölçüm anı ve skor referansı. */
  now: Date;
  /** Gerçek tutar mutabakatı için üst bekleme (ms; varsayılan 150 sn: kullanımın oturması ≥ 60 sn sürer). 0 = deneme yok. */
  reconcileWaitMs?: number;
  log?: (line: string) => void;
}

const DEFAULT_RECONCILE_WAIT_MS = 150_000;

export async function collectOnce(options: CollectOptions, depsIn: CollectDeps = {}): Promise<CollectSummary> {
  const deps = resolveDeps(depsIn);
  const limit = options.limit ?? DEFAULT_CONTENT_LIMIT;
  const maxUsd = options.maxUsd ?? DEFAULT_MAX_USD;
  const log = options.log ?? (() => undefined);

  const { targets, skipped, ownViaZernio } = await loadTargets(deps.client, options.workspaceId, { ownOnly: options.ownOnly });
  const notes: string[] = skipped.length > 0 ? [`Platform modülü olmayan hesaplar atlandı: ${skipped.join(", ")}.`] : [];
  if (ownViaZernio.length > 0) notes.push(`Kendi hesap Zernio'dan okunuyor, Apify'a gitmedi: ${ownViaZernio.join(", ")}.`);
  const reports = new Map<string, TargetReport>(
    targets.map((target) => [ownerKey(target.owner), { handle: target.handle, kind: target.owner.kind }]),
  );
  const cost = { reservedUsd: 0, pendingReconcile: 0 };
  if (targets.length === 0) {
    return { outcome: "no_targets", targets: [], runs: [], cost, notes: [...notes, "Toplanacak hesap yok."] };
  }

  const plan = await buildPlan(targets, { limit, maxUsd, newerThan: options.newerThan }, deps.estimate);
  const base = { plan, targets: [...reports.values()], runs: [], cost };
  if (options.dryRun) return { ...base, outcome: "dry_run", notes };
  if (!plan.withinCeiling) {
    const message =
      `Tahmini toplam ${formatUsd(plan.estimatedUsd) ?? "?"} harcama tavanı ${formatUsd(plan.maxUsd) ?? "?"} değerini aşıyor; ` +
      "HİÇBİR koşu başlatılmadı.";
    return { ...base, outcome: "blocked", notes: [...notes, message] };
  }

  const ctx: CollectContext = {
    workspaceId: options.workspaceId,
    now: options.now,
    purpose: options.purpose,
    deps,
    log,
    runIds: [],
    pending: new Map(),
    notes,
    followers: new Map<string, number>(),
  };

  await collectProfiles(ctx, plan.jobs.filter((job) => job.spec.kind === "profile"), reports);
  await collectContent(ctx, plan.jobs.filter((job) => job.spec.kind === "content"), reports);
  if (ctx.stop) ctx.notes.push(`Toplama erken durduruldu: ${ctx.stop}.`);

  let scoring: CollectSummary["scoring"];
  try {
    log("Skorlar yeniden hesaplanıyor...");
    const result = await deps.recompute(options.workspaceId, options.now);
    scoring = {
      items: result.items,
      owners: result.owners.length,
      failures: result.failures.map((failure) => ({ owner: ownerKey(failure.owner), message: failure.message })),
    };
  } catch (error) {
    ctx.notes.push(`Skor hesaplanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}.`);
  }

  await settleReconciliation(ctx, options.reconcileWaitMs ?? DEFAULT_RECONCILE_WAIT_MS);
  if (ctx.pending.size > 0) {
    ctx.notes.push(
      `${ctx.pending.size} koşunun gerçek tutarı henüz kesinleşmedi (Apify kullanımı oturmadı; geçici tutar yazılmış olabilir): "mutabakat bekliyor", 0 değil. ` +
        "Koşu bitiminden ≥ 60 sn sonra, iki ardışık okumada değer sabitlenince mutabakatla (reconcileOpenRuns) kesinleşir.",
    );
  }
  const { runs, cost: finalCost } = await readRunReports(ctx);

  // Döngü işleri (para harcamaz): bekleyen bağları çöz → öneri üret → ölçüm bildirimi. Hata turu düşürmez.
  let afterCollect: CollectSummary["afterCollect"];
  try {
    afterCollect = await deps.afterCollect(deps.client, options.workspaceId, options.now);
  } catch (error) {
    ctx.notes.push(`Döngü işleri yapılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}.`);
  }

  return { outcome: "completed", plan, targets: [...reports.values()], runs, scoring, cost: finalCost, afterCollect, notes: ctx.notes };
}
