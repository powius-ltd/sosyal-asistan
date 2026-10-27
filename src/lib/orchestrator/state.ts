/**
 * `loadRoutineState`: rutinin durumunu DB'den OKUR (salt okuma, yazma/LLM/Apify yok; sabit sayıda okuma, içerik başına sorgu yok).
 * Aday kurma, `analyze-run`/`label-run`'ın seçimle aynı saf işlevlerini (`selectForAnalysis`, `selectForLabeling`) kullanır: sayılar
 * "koşsaydı ne seçerdi"nin üst sınırıdır (konu eleği LLM'le koşuda yeniden çalışabilir; kayıtlı karar dikkate alınır).
 */
import "server-only";

import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { usesMatrix } from "@/lib/domain/account-type";
import { briefingFreshness, latestSuccessfulCollectionAt } from "@/lib/domain/briefing";
import type { ContentItem } from "@/lib/domain/content";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { audienceZone } from "@/lib/insights";
import { nextMondayOf } from "@/lib/intel/args";
import { selectForAnalysis, type AnalysisCandidate } from "@/lib/intel/analysis-select";
import type { IntelContext } from "@/lib/intel/context";
import { loadAllContent, loadScreens, loadTranscripts } from "@/lib/intel/content-load";
import { labelingSkipReason, selectForLabeling, toLabelCandidate } from "@/lib/intel/label-select";
import { loadLabelVersions } from "@/lib/intel/label-store";
import { dropStaleScreens } from "@/lib/intel/screen-freshness";
import { PROMPT_VERSION as LABEL_PROMPT_VERSION } from "@/lib/llm/label-angles";
import { PROMPT_VERSION as SCREEN_PROMPT_VERSION } from "@/lib/llm/screen-topics";
import { countNewContent, referenceCollectionUsd } from "@/lib/orchestrator/state-derive";
import type { RoutineState } from "@/lib/orchestrator/types";

export interface StateOptions {
  /** `--apify-max` (USD); yoksa Apify onayı yok. */
  apifyMaxUsd?: number;
  /** Konu kümeleme adımı bağlı mı (`RoutineWiring.clusterOnly` verildi mi); bağlı değilse adım atlanır. Varsayılan false. */
  clusteringAvailable?: boolean;
}

/**
 * Konu kümelerinin durumu (kümeli / kümesiz analizli video): konu × hook matrisinden. Matrisi kullanmayan türde ya da depo henüz uygulamıyorsa
 * (`not_implemented`) sayılar undefined kalır (0 değil); başka hata fırlar.
 */
async function readClusterCounts(repo: PanelRepository, wsId: string, applies: boolean): Promise<{ clusteredCount?: number; unclusteredCount?: number }> {
  if (!applies) return {};
  try {
    const matrix = await repo.getTopicHookMatrix(wsId);
    return { clusteredCount: matrix.clusteredCount, unclusteredCount: matrix.unclusteredCount };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "not_implemented") return {};
    throw error;
  }
}

/** Hafta anahtarları (saat dilimi: hedef kitle): hedef plan haftası (gelecek Pazartesi) ve içinde bulunulan hafta (bildirim/rapor anahtarı). */
export function routineWeeks(ctx: Pick<IntelContext, "workspace" | "now">): { planWeek: string; currentWeek: string } {
  const today = toDayKey(ctx.now, audienceZone(ctx.workspace)) as string;
  return { planWeek: nextMondayOf(today), currentWeek: weekStartOf(today) as string };
}

const RUN_PAGE = 50;
const PLAN_PAGE = 20;

export async function loadRoutineState(ctx: IntelContext, options: StateOptions = {}): Promise<RoutineState> {
  const { repo, client, workspaceId: wsId, now } = ctx;
  const { planWeek } = routineWeeks(ctx);
  const accountType = ctx.workspace.accountType;
  const labels = labelingSkipReason(accountType) === undefined;
  const clusters = usesMatrix(accountType, "topic_hook");

  const [competitors, all, rawScreens, transcripts, labelVersions, runs, plans, due, briefing, clusterCounts] = await Promise.all([
    repo.listCompetitors(wsId, { status: "tracked" }),
    loadAllContent(repo, wsId, { format: "short_video" }),
    loadScreens(client, wsId),
    loadTranscripts(client, wsId, now),
    loadLabelVersions(client, wsId),
    repo.listRuns(wsId, { provider: "apify", status: ["ingested", "succeeded"], limit: RUN_PAGE }),
    repo.listWeeklyPlans(wsId, { limit: PLAN_PAGE }),
    repo.listMeasurementDue(wsId, now),
    repo.getLatestBriefing(wsId),
    readClusterCounts(repo, wsId, clusters),
  ]);

  const tracked = new Set(competitors.map((c) => c.id));
  const items: ContentItem[] = all.filter((item) => item.owner.kind === "own" || tracked.has(item.owner.id));
  const { screens } = dropStaleScreens(rawScreens, SCREEN_PROMPT_VERSION);

  const analysisCandidates: AnalysisCandidate[] = items.map((item) => ({
    id: item.id,
    isOwn: item.owner.kind === "own",
    handle: item.owner.handle,
    lift: item.score.lift,
    liftTier: item.score.liftTier,
    publishedAt: item.publishedAt,
    inNiche: screens.get(item.id)?.inNiche,
    analysisStatus: item.analysisStatus,
  }));
  const selectable = selectForAnalysis(analysisCandidates, { limit: Number.MAX_SAFE_INTEGER }).length;

  const labelCandidates = items.map((item) =>
    toLabelCandidate(item, { transcript: transcripts.get(item.id), inNiche: rawScreens.get(item.id)?.inNiche, labelPromptVersion: labelVersions.get(item.id) }),
  );
  // Açı etiketlemesi uygulanmayan türde (içerik üreticisi) etiketlenecek video sayılmaz.
  const eligible = labels ? selectForLabeling(labelCandidates, { promptVersion: LABEL_PROMPT_VERSION }).selected.length : 0;

  const lastCollectedAt = latestSuccessfulCollectionAt(runs.items);
  const plan = plans.find((p) => p.weekStart === planWeek);

  return {
    now: now.toISOString(),
    accountType,
    planWeek,
    ...(options.apifyMaxUsd === undefined ? {} : { apifyMaxUsd: options.apifyMaxUsd }),
    collection: {
      lastCollectedAt,
      referenceUsd: referenceCollectionUsd(runs.items),
      newContentSinceBriefing: countNewContent(items, briefing?.generatedAt),
    },
    analysis: { selectable },
    labeling: { eligible },
    clustering: { available: options.clusteringAvailable === true, ...clusterCounts },
    plan: plan === undefined ? { exists: false } : { exists: true, status: plan.status, plannedCount: plan.plannedCount },
    measurement: { dueCount: due.length, capApproved: ctx.workspace.measureMonthlyCapUsd !== undefined },
    briefing: briefing === null ? {} : { generatedAt: briefing.generatedAt, freshness: briefingFreshness(briefing.generatedAt, { now, lastCollectedAt }) },
  };
}
