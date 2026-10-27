/**
 * Toplama planı + harcama tavanı ön kontrolü. Plan: platform başına TEK profil koşusu (tüm hedefler) + her hedef
 * için bir içerik (reel) koşusu (`limit` sonuç, transcript kapalı). Tahmin = aktör birim fiyatı (Apify'dan okunur,
 * para harcamaz) × beklenen sonuç sayısı; koşu başlatmada rezerve edilen tutarla aynı hesaptır.
 *
 * Tavan kuralı: TOPLAM tahmin `maxUsd`'yi aşarsa HİÇBİR koşu başlamaz (kısmi çalıştırma yok): kullanıcı onayı toplam
 * içindir, yarım toplamayla skor ve rapor tutarsız kalırdı.
 */
import "server-only";

import type { CostEstimate } from "@/lib/apify/pricing";
import { roundUsd } from "@/lib/apify/usd";
import type { CollectPlan, CollectTarget, PlannedJob } from "@/lib/collection/types";
import { getPlatformModule } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";

/** Kullanıcı onayı (2026-09-30): tek seferlik toplama için en çok $0,20. */
export const DEFAULT_MAX_USD = 0.2;
/** Hedef başına çekilecek son reel sayısı. */
export const DEFAULT_CONTENT_LIMIT = 10;
/** `--limit` üst sınırı (yanlış yazımla büyük harcamayı önler; tavan yine ayrıca işler). */
export const MAX_CONTENT_LIMIT = 50;

export type CostEstimator = (actorId: string, expectedResults: number) => Promise<CostEstimate>;

export interface PlanOptions {
  limit: number;
  maxUsd: number;
  /** Yalnız bu andan yeni içerik (ISO; aktör `onlyPostsNewerThan`). Ölçüm koşusu son 10 günü tarar. */
  newerThan?: string;
}

function groupByPlatform(targets: readonly CollectTarget[]): Map<Platform, CollectTarget[]> {
  const groups = new Map<Platform, CollectTarget[]>();
  for (const target of targets) groups.set(target.platform, [...(groups.get(target.platform) ?? []), target]);
  return groups;
}

export async function buildPlan(
  targets: readonly CollectTarget[],
  options: PlanOptions,
  estimate: CostEstimator,
): Promise<CollectPlan> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_CONTENT_LIMIT) {
    throw new RangeError(`limit 1–${MAX_CONTENT_LIMIT} arasında tam sayı olmalı (verilen: ${String(options.limit)}).`);
  }
  if (!Number.isFinite(options.maxUsd) || options.maxUsd < 0) {
    throw new RangeError("Harcama tavanı sonlu ve negatif olmayan bir sayı olmalı.");
  }

  const specs: { spec: PlannedJob["spec"]; label: string; targets: CollectTarget[] }[] = [];
  // 1) Platform başına tek profil koşusu.
  for (const [platform, group] of groupByPlatform(targets)) {
    const adapter = getPlatformModule(platform).publicData;
    specs.push({
      spec: adapter.buildProfileJob(group.map((target) => target.handle)),
      label: `profil (${group.length} hesap)`,
      targets: group,
    });
  }
  // 2) Her hedef için içerik koşusu.
  for (const target of targets) {
    const adapter = getPlatformModule(target.platform).publicData;
    specs.push({
      spec: adapter.buildContentJob({ handle: target.handle, limit: options.limit, newerThan: options.newerThan, includeTranscript: false }),
      label: `@${target.handle}`,
      targets: [target],
    });
  }

  const jobs: PlannedJob[] = [];
  for (const { spec, label, targets: jobTargets } of specs) {
    const cost = await estimate(spec.actorId, spec.expectedResults);
    jobs.push({ label, spec, targets: jobTargets, estimatedUsd: cost.amountUsd, priceUnknown: cost.priceUnknown });
  }

  const estimatedUsd = roundUsd(jobs.reduce((sum, job) => sum + job.estimatedUsd, 0));
  return {
    jobs,
    estimatedUsd,
    maxUsd: options.maxUsd,
    withinCeiling: estimatedUsd <= roundUsd(options.maxUsd),
    priceUnknown: jobs.some((job) => job.priceUnknown),
  };
}
