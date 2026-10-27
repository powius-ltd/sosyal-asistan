/**
 * Viral av planı: konu × platform işleri ve tahmini tutar (para HARCAMAZ; yalnız aktör fiyatı okunur, okunamazsa platformun yedek fiyatı).
 * Instagram'da yazar takipçisi av sonucunda gelmediğinden, eşiği geçmesi olası yazarlar için profil çağrısı payı da tahmine eklenir.
 */
import "server-only";

import { roundUsd } from "@/lib/apify/usd";
import { listPlatformModules } from "@/lib/platforms/registry";
import type { Platform, PlatformModule, ScrapeJobSpec } from "@/lib/platforms/types";
import type { ViralTopic } from "@/lib/viral/queries";
import { VIRAL_PROFILE_SHARE_ESTIMATE, VIRAL_WEEKLY_CAP_USD } from "@/lib/viral/thresholds";

export interface ViralEstimator {
  (actorId: string, expectedResults: number): Promise<{ amountUsd: number; priceUnknown: boolean }>;
}

export interface ViralPlanJob {
  platform: Platform;
  topic: ViralTopic;
  label: string;
  spec: ScrapeJobSpec;
  estimatedUsd: number;
  priceUnknown: boolean;
}

export interface ViralProfilePlan {
  platform: Platform;
  actorId: string;
  /** Tahmini profil sayısı (üst tahmin). */
  expectedProfiles: number;
  estimatedUsd: number;
  priceUnknown: boolean;
}

export interface ViralPlan {
  platforms: Platform[];
  jobs: ViralPlanJob[];
  profiles: ViralProfilePlan[];
  /** Tüm av + profil çağrılarının tahmini toplamı (USD). */
  estimatedUsd: number;
  capUsd: number;
  withinCap: boolean;
  priceUnknown: boolean;
}

/** Viral av tanımlı platform modülleri (tanımsız platform sessizce atlanır; başka platformun kuralı uygulanmaz). */
export function viralPlatforms(): PlatformModule[] {
  return listPlatformModules().filter((mod) => mod.publicData.viral !== undefined);
}

export async function planViralHunt(o: { topics: readonly ViralTopic[]; perQueryLimit: number; estimate: ViralEstimator }): Promise<ViralPlan> {
  const jobs: ViralPlanJob[] = [];
  const profiles: ViralProfilePlan[] = [];
  const modules = viralPlatforms();

  for (const mod of modules) {
    const viral = mod.publicData.viral;
    if (viral === undefined) continue;
    let results = 0;
    for (const topic of o.topics) {
      const spec = viral.buildJob({ query: topic.query, limit: o.perQueryLimit });
      const estimate = await o.estimate(spec.actorId, spec.expectedResults);
      jobs.push({ platform: mod.platform, topic, label: `viral:${mod.platform}:${topic.query}`, spec, estimatedUsd: estimate.amountUsd, priceUnknown: estimate.priceUnknown });
      results += spec.expectedResults;
    }
    if (!viral.followersInResult && results > 0) {
      const expectedProfiles = Math.max(1, Math.ceil(results * VIRAL_PROFILE_SHARE_ESTIMATE));
      // Profil işinin aktörünü öğrenmek için geçerli örnek kullanıcı adı yeterli (koşu açılmaz).
      const actorId = mod.publicData.buildProfileJob(["ornek"]).actorId;
      const estimate = await o.estimate(actorId, expectedProfiles);
      profiles.push({ platform: mod.platform, actorId, expectedProfiles, estimatedUsd: estimate.amountUsd, priceUnknown: estimate.priceUnknown });
    }
  }

  const estimatedUsd = roundUsd([...jobs, ...profiles].reduce((sum, item) => sum + item.estimatedUsd, 0));
  return {
    platforms: modules.map((mod) => mod.platform),
    jobs,
    profiles,
    estimatedUsd,
    capUsd: VIRAL_WEEKLY_CAP_USD,
    withinCap: estimatedUsd <= VIRAL_WEEKLY_CAP_USD,
    priceUnknown: [...jobs, ...profiles].some((item) => item.priceUnknown),
  };
}
