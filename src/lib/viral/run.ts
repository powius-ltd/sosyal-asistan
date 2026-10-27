/**
 * Viral av koşusu: konu sorguları → platform başına av → ön süzgeç → (Instagram) yazar takipçisi → eşik → `viral_items`.
 *
 * Para kuralı: ücretli çağrı YALNIZ `maxUsd` verilmişse ve `dryRun` değilse açılır; her koşu mevcut bütçeli yoldan geçer (`runWithinBudget`:
 * fiyat oku → tavana sığıyor mu → `reserveBudget` → başlat; gerçek tutar mutabakatla). `maxUsd` haftalık tavanı (`VIRAL_WEEKLY_CAP_USD`) aşamaz.
 * Kuru koşu sorguları, tahmini sonuç sayısını ve tahmini tutarı döndürür; hiçbir tabloya yazmaz, hiçbir koşu açmaz.
 */
import "server-only";

import { estimateActorCost } from "@/lib/apify/pricing";
import { affordableCount, closePaidRun, createPaidRun, runWithinBudget } from "@/lib/collection/discover-paid";
import type { CollectDeps, CollectSummary } from "@/lib/collection/types";
import type { Platform } from "@/lib/platforms/types";
import { getPlatformModule } from "@/lib/platforms/registry";
import { planViralHunt, viralPlatforms, type ViralEstimator, type ViralPlan } from "@/lib/viral/plan";
import { buildViralTopics, type ViralTopic } from "@/lib/viral/queries";
import { applyFollowers, authorKey, authorsNeedingFollowers, dedupeFound, prefilterFound, selectViral, type FoundVideo, type ViralItem } from "@/lib/viral/select";
import { loadViralSources } from "@/lib/viral/sources";
import { saveViralItems, type ViralWriteResult } from "@/lib/viral/store";
import { remainingWeeklyUsd, weekSpentUsd } from "@/lib/viral/week-spend";
import { VIRAL_RESULTS_PER_QUERY, VIRAL_WEEKLY_CAP_USD } from "@/lib/viral/thresholds";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

export interface ViralHuntOptions {
  workspaceId: string;
  now: Date;
  /** Elle eklenen konular (her zaman önce gelir). */
  manualTopics?: readonly string[];
  /** Verilmezse ücretli çağrı AÇILMAZ (kuru koşu gibi davranır). */
  maxUsd?: number;
  dryRun?: boolean;
  perQueryLimit?: number;
  /** Tur sonu mutabakat bekleme süresi (ms). */
  settleWaitMs?: number;
  log?: (line: string) => void;
}

export interface ViralHuntDeps {
  collect?: CollectDeps;
  client?: AdminClient;
  /** Kuru koşu fiyat okuyucusu (testte sahte). */
  estimate?: ViralEstimator;
  /** Testler için: bu haftaki harcama okuyucusu (varsayılan `collection_runs` toplamı), kayıt ve tur kapatma. */
  weekSpent?: () => Promise<number>;
  save?: typeof saveViralItems;
  close?: typeof closePaidRun;
}

export interface TopicReport {
  platform: Platform;
  query: string;
  /** Koşunun döndürdüğü ayrıştırılmış video sayısı; koşu yapılmadıysa `undefined`. */
  found?: number;
  /** Eşiği geçen (kayda aday) video sayısı. */
  viral: number;
  skippedReason?: string;
}

export interface ViralHuntSummary {
  outcome: "dry_run" | "no_topics" | "done" | "blocked";
  reason?: string;
  topics: ViralTopic[];
  plan: ViralPlan;
  topicReports: TopicReport[];
  /** Ön süzgeçten geçen video / profil çağrısıyla takipçisi okunan yazar sayısı. */
  prefiltered: number;
  profilesRead: number;
  selected: number;
  written?: ViralWriteResult;
  cost?: CollectSummary["cost"];
  notes: string[];
}

const EMPTY_PLAN: ViralPlan = { platforms: [], jobs: [], profiles: [], estimatedUsd: 0, capUsd: VIRAL_WEEKLY_CAP_USD, withinCap: true, priceUnknown: false };

async function defaultEstimate(actorId: string, expectedResults: number): ReturnType<ViralEstimator> {
  const { amountUsd, priceUnknown } = await estimateActorCost(actorId, expectedResults);
  return { amountUsd, priceUnknown };
}

export async function runViralHunt(options: ViralHuntOptions, deps: ViralHuntDeps = {}): Promise<ViralHuntSummary> {
  const log = options.log ?? (() => undefined);
  const client = deps.client ?? getAdminClient();
  const perQueryLimit = options.perQueryLimit ?? VIRAL_RESULTS_PER_QUERY;
  const notes: string[] = [];

  const sources = await loadViralSources(client, options.workspaceId);
  const topics = buildViralTopics({ ...sources, manual: options.manualTopics });
  if (topics.length === 0) {
    return { outcome: "no_topics", reason: "Konu çıkarılamadı: niş özeti, konu kümesi ve etiket boş. --konu= ile elle ver.", topics, plan: EMPTY_PLAN, topicReports: [], prefiltered: 0, profilesRead: 0, selected: 0, notes };
  }

  const estimate = deps.estimate ?? deps.collect?.estimate ?? defaultEstimate;
  const plan = await planViralHunt({ topics, perQueryLimit, estimate: async (actorId, n) => estimate(actorId, n) });
  const base = { topics, plan, topicReports: [] as TopicReport[], prefiltered: 0, profilesRead: 0, selected: 0, notes };

  if (options.dryRun === true || options.maxUsd === undefined) {
    return { outcome: "dry_run", ...base };
  }
  const maxUsd = options.maxUsd;
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > VIRAL_WEEKLY_CAP_USD) {
    return { outcome: "blocked", reason: `--apify-max 0'dan büyük ve haftalık tavan olan ${VIRAL_WEEKLY_CAP_USD} USD'yi aşmayan bir tutar olmalı (verilen: ${String(maxUsd)}).`, ...base };
  }

  // Haftalık tavan koşu başına yenilenmez: bu haftaki harcama düşülür, kalan tavanı aşan tutar kırpılır, kalan yoksa koşu açılmaz.
  const remaining = remainingWeeklyUsd(await (deps.weekSpent ?? (() => weekSpentUsd(client, options.workspaceId, options.now)))());
  if (remaining <= 0) {
    return { outcome: "blocked", reason: `Bu haftanın viral av tavanı (${VIRAL_WEEKLY_CAP_USD} USD) doldu; yeni hafta başlayınca yeniden dene.`, ...base };
  }
  const cappedUsd = Math.min(maxUsd, remaining);
  if (cappedUsd < maxUsd) notes.push(`Haftalık tavandan ${remaining} USD kaldı; --apify-max ${cappedUsd} USD'ye indirildi.`);
  const paid = createPaidRun({ workspaceId: options.workspaceId, now: options.now, maxUsd: cappedUsd, log }, deps.collect);
  // Kayıt ya da herhangi bir adım patlasa da açılan Apify koşuları mutabakata bağlanır (`finally`): rezerve tutar askıda kalmaz.
  let cost: CollectSummary["cost"] | undefined;
  let body: Omit<ViralHuntSummary, "cost" | "notes"> | undefined;
  let primaryFailed = false;
  try {
    const found: FoundVideo[] = [];
    const topicReports: TopicReport[] = [];

    for (const job of plan.jobs) {
      const viral = getPlatformModule(job.platform).publicData.viral;
      const report: TopicReport = { platform: job.platform, query: job.topic.query, viral: 0 };
      topicReports.push(report);
      if (viral === undefined) continue;
      log(`av: ${job.label}`);
      const result = await runWithinBudget(paid, { label: job.label, spec: job.spec });
      if (!result.ok) {
        report.skippedReason = "reason" in result ? result.reason : "koşu yapılmadı";
        notes.push(`${job.label}: ${report.skippedReason}`);
        continue;
      }
      const parsed = viral.parse(result.items);
      report.found = parsed.items.length;
      for (const video of parsed.items) found.push({ ...video, query: job.topic.query });
    }

    const unique = dedupeFound(found);
    const prefiltered = prefilterFound(unique, options.now);

    // Instagram: yazar takipçisi av sonucunda yok → eşiği ön süzgeçten geçen yazarlar için profil çağrısı (kalan tavana göre).
    const followers = new Map<string, number>();
    for (const mod of viralPlatforms()) {
      if (mod.publicData.viral?.followersInResult !== false) continue;
      const authors = authorsNeedingFollowers(prefiltered.filter((video) => video.platform === mod.platform));
      if (authors.length === 0) continue;
      const spec = mod.publicData.buildProfileJob(authors.map((a) => a.handle));
      const count = await affordableCount(paid, spec.actorId, authors.length, 1);
      if (count === 0) {
        notes.push(`${mod.platform}: yazar takipçisi okunamadı (kalan tavan profil çağrısına yetmedi); bu yazarların videoları eşikten geçmez.`);
        continue;
      }
      const chosen = authors.slice(0, count);
      if (count < authors.length) notes.push(`${mod.platform}: ${authors.length} yazardan en çok izlenenler ${count} tanesi için profil okundu (tavan).`);
      const profileSpec = mod.publicData.buildProfileJob(chosen.map((a) => a.handle));
      const result = await runWithinBudget(paid, { label: `viral:${mod.platform}:profil (${chosen.length} hesap)`, spec: profileSpec });
      if (!result.ok) {
        notes.push(`${mod.platform}: profil çağrısı yapılamadı: ${"reason" in result ? result.reason : "atlandı"}`);
        continue;
      }
      for (const profile of mod.publicData.parseProfiles(result.items).items) {
        if (profile.followers !== undefined) followers.set(authorKey(mod.platform, profile.handle), profile.followers);
      }
    }

    const withFollowers = applyFollowers(prefiltered, followers);
    const selected: ViralItem[] = selectViral(withFollowers, options.now);
    for (const report of topicReports) report.viral = selected.filter((item) => item.platform === report.platform && item.query === report.query).length;

    const written = await (deps.save ?? saveViralItems)(client, options.workspaceId, selected, options.now);
    body = { outcome: "done", topics, plan, topicReports, prefiltered: prefiltered.length, profilesRead: followers.size, selected: selected.length, written };
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    // Kapatma da patlarsa ASIL hata gizlenmez: gövde zaten düştüyse kapatma hatası yalnız günlüğe yazılır; gövde sağlamsa kapatma hatası fırlar.
    try {
      cost = await (deps.close ?? closePaidRun)(paid, options.settleWaitMs ?? 0);
    } catch (closeError) {
      if (!primaryFailed) throw closeError;
      log(`koşu kapatılamadı (asıl hata korunuyor): ${closeError instanceof Error ? closeError.message : "bilinmeyen hata"}`);
    }
  }
  return { ...(body as NonNullable<typeof body>), cost, notes: [...notes, ...paid.ctx.notes] };
}
