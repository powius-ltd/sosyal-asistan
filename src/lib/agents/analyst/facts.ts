/**
 * Analist olgu paketi (`collectFacts`): brifingin TEK girdisi. Yalnız `PanelRepository` OKUMA metotları (yazma/Apify/LLM yok), JSON
 * ≤ `FACTS_MAX_BYTES` (taşarsa öncelik sırasıyla kırpılır, `omitted` yazılır). Ölçülemeyen alan pakete GİRMEZ: belirteci `unmeasured`
 * listesine sebebiyle yazılır (undefined ≠ 0). Her olgunun kararlı bir ref'i vardır (`domain/briefing-refs`); eylem listesini KOD üretir.
 * Rakip metni kısaltılır ve paket `dataBlock` içinde gider (prompt). Plan: `docs/AJAN-PLAN.md` §2.
 */
import "server-only";

import {
  cellEntry,
  contentEntry,
  contentInputFromItem,
  contentInputFromSummary,
  dueEntry,
  linkEntry,
  planEntry,
  planRole,
  reviewEntry,
  roundForPack,
} from "@/lib/agents/analyst/facts-entries";
import { commandActions, planGenerable } from "@/lib/agents/analyst/facts-commands";
import { ownBestContents, OWN_BEST_WINDOW_DAYS } from "@/lib/agents/analyst/facts-own-best";
import { ageInDays, latestOwnContent } from "@/lib/agents/analyst/facts-own-latest";
import { assembleFacts } from "@/lib/agents/analyst/facts-pack";
import { topicCellEntry } from "@/lib/agents/analyst/facts-topic";
import type { AccountFacts, BriefingFacts, FactEntry } from "@/lib/agents/analyst/facts-types";
import { TokenTable, type TokenFormat } from "@/lib/agents/analyst/tokens";
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import { accountTypeLabel, accountTypeProfile, usesMatrix } from "@/lib/domain/account-type";
import { latestSuccessfulCollectionAt, type BriefingBasis } from "@/lib/domain/briefing";
import type { ContentItem } from "@/lib/domain/content";
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { CreativeMatrixCell, CreativeMatrixSample } from "@/lib/domain/creative-matrix";
import type { KpiUnit } from "@/lib/domain/overview";
import type { TopicHookCell, TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { confidenceForSample, weekStartOf, type ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { loadAllContent } from "@/lib/intel/content-load";
import { clipForPrompt } from "@/lib/llm/prompt-blocks";
import { DAY_MS, weekdayName } from "@/lib/time";

export interface FactsContext {
  repo: PanelRepository;
  workspaceId: string;
  /** İsteğin tek saati. */
  now: Date;
}

export interface FactsOptions {
  maxBytes?: number;
  /**
   * Bu ayın harcaması (`apify_usd`, `apify_cap_usd`, `sub_runs`) pakete girsin mi. YÖNETİCİ bilgisidir: yalnız yönetici modunda
   * (`isOperatorMode()`) okunan, saklanmayan yanıtta (sohbet) true verilir. Varsayılan false: brifing DB'ye yazılır ve müşteri
   * görünümünde de çizilir, bu yüzden hiç harcama taşımaz. false iken belirteçler `unmeasured`'a da yazılmaz (ölçülemedi değil, yok).
   */
  includeSpend?: boolean;
}

const NICHE_CHARS = 400;
/** Sıra (küçük = önemli): boyut aşımında büyük olan önce atılır. */
const RANK = { planThisWeek: 5, planLatest: 8, winner: 9, opportunity: 12, ownLatest: 14, review: 15, ownBest: 16, ownTop: 21, rivalNew: 30, due: 40, link: 45, tried: 50, example: 70 } as const;
const OPPORTUNITY_MAX = 3;
const WINNER_MAX = 3;
const TRIED_MAX = 2;
const OWN_TOP_MAX = 3;
const RIVAL_MAX = 5;
const DUE_MAX = 3;
const LINK_MAX = 3;
const EXAMPLES_PER_CELL = 2;
/** Güveni kendi gönderi sayısına bağlı KPI'lar. */
const OWN_POST_KPIS: ReadonlySet<string> = new Set(["views", "engagement_rate"]);

const KPI_FORMAT: Record<KpiUnit, TokenFormat> = { count: "int", percent: "percent", seconds: "int", usd: "usd" };

/** Genel olgu: değer (varsa) `numbers`'a, belirteç tabloya (ölçülemiyorsa yalnız sebep). */
class Numbers {
  readonly values: Record<string, number> = {};
  constructor(private readonly tokens: TokenTable) {}

  set(name: string, format: TokenFormat, value: number | undefined, reason?: string, confidence?: ConfidenceLevel): void {
    this.tokens.addGlobal(name, format, value, reason, confidence);
    if (typeof value === "number" && Number.isFinite(value)) this.values[name] = roundForPack(value);
  }
}

/** Pazartesi'ye göre bir önceki haftanın başı (YYYY-MM-DD). */
function previousWeekStart(weekStart: string): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(dayKey: string): string {
  return weekdayName((new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7) ?? "";
}

export async function collectFacts(ctx: FactsContext, options: FactsOptions = {}): Promise<BriefingFacts> {
  const { repo, workspaceId: ws, now } = ctx;
  const workspace = await repo.getWorkspace(ws);
  if (workspace === null) throw new Error("Çalışma alanı bulunamadı (olgu paketi kurulamadı).");
  const dayKey = toDayKey(now, workspace.timezone);
  const currentWeek = dayKey === undefined ? undefined : weekStartOf(dayKey);
  if (dayKey === undefined || currentWeek === undefined) throw new Error("Bugünün takvim günü hesaplanamadı.");

  const accountType = workspace.accountType;
  const profile = accountTypeProfile(accountType);
  const useAngle = usesMatrix(accountType, "angle_funnel");
  const useTopic = usesMatrix(accountType, "topic_hook");

  const [overview, digest, matrix, topicMatrix, trackedRivals, planList, review, due, links, approvals, unread, cost, runs, content] = await Promise.all([
    repo.getOverview(ws, { days: 30 }),
    repo.getWeeklyDigest(ws, now),
    useAngle ? repo.getCreativeMatrix(ws) : undefined,
    useTopic ? readTopicMatrix(repo, ws) : undefined,
    repo.listCompetitors(ws, { status: "tracked" }),
    repo.listWeeklyPlans(ws, { limit: 1 }),
    repo.getWeekReview(ws, previousWeekStart(currentWeek), now),
    repo.listMeasurementDue(ws, now),
    repo.listIdeaLinks(ws, { status: "suggested", limit: 200 }),
    repo.listPublishJobs(ws, { status: "awaiting_approval" }),
    repo.countUnreadNotifications(ws),
    options.includeSpend ? repo.getCostSummary(ws) : undefined,
    repo.listRuns(ws, { provider: "apify", status: "ingested", limit: 20 }),
    loadAllContent(repo, ws, {}),
  ]);
  const plan = planList[0] === undefined ? null : await repo.getWeeklyPlan(ws, planList[0].weekStart);

  const tokens = new TokenTable();
  const numbers = new Numbers(tokens);
  const entries: FactEntry[] = [];
  const index = new Map<string, ContentItem>(content.map((item) => [item.id, item]));

  const lastCollectedAt = latestSuccessfulCollectionAt(runs.items);
  const daysSinceCollect = lastCollectedAt === undefined ? undefined : Math.max(0, Math.floor((now.getTime() - Date.parse(lastCollectedAt)) / DAY_MS));

  // ---- Genel sayılar
  // İzlenme/etkileşim kendi gönderilerine dayanır: dönemdeki gönderi azsa o sayılar düşük güvenlidir (sayım ve takipçi kesindir).
  const ownSample = confidenceForSample(overview.kpis.find((kpi) => kpi.key === "posts")?.value);
  for (const kpi of overview.kpis) {
    const format = KPI_FORMAT[kpi.unit];
    const confidence = OWN_POST_KPIS.has(kpi.key) ? ownSample : undefined;
    numbers.set(kpi.key, format, kpi.value, kpi.unmeasuredReason ?? "bu dönemde ölçülemedi", confidence);
    numbers.set(`${kpi.key}_prev`, format, kpi.previous, "önceki dönem ölçülemedi", confidence);
  }
  const digestReasons = digest.unmeasuredReasons;
  numbers.set("followers_delta", "signed", digest.own.followersDelta, digestReasons.followersDelta);
  numbers.set("week_views", "int", digest.own.views, digestReasons.views, ownSample);
  numbers.set("week_ideas_new", "int", digest.ideas.new);
  numbers.set("week_ideas_scripted", "int", digest.ideas.scripted);
  const analyzedCount = content.filter((item) => item.analysisStatus === "ok").length;
  numbers.set("analyzed", "int", analyzedCount);
  if (matrix !== undefined) {
    numbers.set("labeled", "int", matrix.labeledCount);
    numbers.set("unlabeled", "int", matrix.unlabeledCount);
  }
  if (topicMatrix !== undefined) {
    numbers.set("topic_clustered", "int", topicMatrix.clusteredCount);
    numbers.set("topic_unclustered", "int", topicMatrix.unclusteredCount);
  }
  const ownBest = ownBestContents(content, now);
  numbers.set("own_best_count", "int", ownBest.total);
  numbers.set("own_best_window", "days", OWN_BEST_WINDOW_DAYS);
  numbers.set("due_count", "int", due.length);
  numbers.set("suggested_count", "int", links.length);
  numbers.set("approval_count", "int", approvals.length);
  numbers.set("unread", "int", unread);
  if (cost !== undefined) {
    numbers.set("apify_usd", "usd", cost.apify.committedUsd);
    numbers.set("apify_cap_usd", "usd", cost.apify.capUsd, "aylık Apify tavanı tanımlı değil");
    numbers.set("sub_runs", "int", cost.subscription.runs);
  }
  numbers.set("days_since_collect", "int", daysSinceCollect, "hiç başarılı toplama kaydı yok");

  // ---- İçerik olguları (her biri benzersiz; aynı içerik birden çok yerden gelirse en önemli sıra kalır)
  const latestOwn = latestOwnContent(content, now);
  const addContent = (id: string, fallback: ContentSummary | undefined, isOwn: boolean, rank: number, extra: { isNew?: boolean; views?: number; item?: ContentItem; ownBest?: boolean } = {}) => {
    const item = extra.item ?? index.get(id);
    const hookType = fallback?.hookType;
    if (item !== undefined) {
      const dates = { ageDays: ageInDays(item.publishedAt, now), latest: item.id === latestOwn?.id };
      entries.push(contentEntry(contentInputFromItem(item, { hookType, isNew: extra.isNew, ownBest: extra.ownBest, ...dates }), tokens, rank));
    }
    else if (fallback !== undefined) entries.push(contentEntry({ ...contentInputFromSummary(fallback, isOwn, extra.views), isNew: extra.isNew }, tokens, rank));
  };
  digest.own.topContent.slice(0, OWN_TOP_MAX).forEach((top, i) => addContent(top.contentItemId, top, true, RANK.ownTop + i, { views: top.views }));
  const rivalIds = new Set<string>();
  const rivals: { id: string; summary?: ContentSummary; item?: ContentItem; isNew: boolean }[] = [
    ...digest.competitors.newOutliers.map((summary) => ({ id: summary.contentItemId, summary, isNew: true })),
    ...overview.recentOutliers.map((item) => ({ id: item.id, item, isNew: false })),
  ];
  for (const rival of rivals) {
    if (rivalIds.size >= RIVAL_MAX || rivalIds.has(rival.id)) continue;
    rivalIds.add(rival.id);
    addContent(rival.id, rival.summary, false, RANK.rivalNew + rivalIds.size, { isNew: rival.isNew, item: rival.item });
  }

  // ---- Kendi tutanlar (son dönem, kendi normalinin eşik katı ve üstü): "en iyi video" iddiası yalnız bunlara dayanır
  ownBest.top.forEach((item, i) => addContent(item.id, undefined, true, RANK.ownBest + i, { item, ownBest: true }));

  // ---- Kendi en son videon ("son videom" sorusu): tutan olsun olmasın pakette; tutansa `best` işareti de korunur
  if (latestOwn !== undefined) addContent(latestOwn.id, undefined, true, RANK.ownLatest, { item: latestOwn, ownBest: ownBest.top.some((item) => item.id === latestOwn.id) });

  // ---- Matris hücreleri (hesap türüne göre: açı × farkındalık ve/veya konu × hook)
  const sortedSamples = (samples: readonly CreativeMatrixSample[], preferOwn: boolean) =>
    [...samples].sort((a, b) => Number(preferOwn ? b.isOwn : a.isOwn) - Number(preferOwn ? a.isOwn : b.isOwn)).slice(0, EXAMPLES_PER_CELL);
  const addExamples = (examples: readonly CreativeMatrixSample[]) => examples.forEach((sample, i) => addContent(sample.contentItemId, sample, sample.isOwn, RANK.example + i));
  const addCell = (cell: CreativeMatrixCell, rank: number, preferOwn: boolean) => {
    const examples = sortedSamples(cell.samples, preferOwn);
    entries.push(cellEntry(cell, tokens, rank, examples.map((sample) => sample.contentItemId)));
    addExamples(examples);
  };
  const addTopicCell = (matrixData: TopicHookMatrix, cell: TopicHookCell, rank: number, preferOwn: boolean) => {
    const examples = sortedSamples(cell.samples, preferOwn);
    const label = matrixData.rows.find((row) => row.key === cell.clusterKey)?.label ?? cell.clusterKey;
    entries.push(topicCellEntry(cell, label, tokens, rank, examples.map((sample) => sample.contentItemId)));
    addExamples(examples);
  };
  matrix?.opportunities.slice(0, OPPORTUNITY_MAX).forEach((cell, i) => addCell(cell, RANK.opportunity + i, false));
  matrix?.cells
    .filter((cell) => cell.status === "tried")
    .sort((a, b) => b.own.n - a.own.n)
    .slice(0, TRIED_MAX)
    .forEach((cell, i) => addCell(cell, RANK.tried + i, true));
  if (topicMatrix !== undefined) {
    topicMatrix.winners.slice(0, WINNER_MAX).forEach((cell, i) => addTopicCell(topicMatrix, cell, RANK.winner + i, true));
    topicMatrix.opportunities.slice(0, OPPORTUNITY_MAX).forEach((cell, i) => addTopicCell(topicMatrix, cell, RANK.opportunity + i, false));
  }

  // ---- Plan + geçen hafta
  const role = plan === null ? undefined : planRole(plan.weekStart, currentWeek);
  if (plan !== null && role !== undefined && plan.weekStart !== review?.weekStart) entries.push(planEntry(plan, role, tokens, role === "past_week" ? RANK.planLatest : RANK.planThisWeek));
  if (review !== null) entries.push(reviewEntry(review, tokens, RANK.review));

  // ---- Bekleyenler
  due.slice(0, DUE_MAX).forEach((item, i) => entries.push(dueEntry(item, RANK.due + i)));
  links.slice(0, LINK_MAX).forEach((link, i) => entries.push(linkEntry(link, RANK.link + i)));

  // ---- Genel komut eylemleri (durumdan ve hesap türünden kod türetir; ajan yalnız seçer)
  const hasRivals = trackedRivals.length > 0;
  const commands = commandActions({
    accountType,
    daysSinceCollect,
    hasUnanalyzed: content.some((item) => item.analysisStatus !== "ok"),
    unlabeledCount: matrix?.unlabeledCount ?? 0,
    planRole: role,
    planGenerable: planGenerable({ analyzedCount, hasRivals, ownBestCount: ownBest.total }),
    dueCount: due.length,
  });

  const basis: BriefingBasis = {
    analyzedCount,
    labeledCount: matrix?.labeledCount ?? 0,
    ...(lastCollectedAt === undefined ? {} : { lastCollectedAt }),
    ...(plan === null ? {} : { planWeek: plan.weekStart }),
  };
  const account: AccountFacts = { type: accountTypeLabel(accountType), purpose: profile.purpose, matrices: [...profile.matrices], hasRivals };

  return assembleFacts({
    weekday: weekdayOf(dayKey),
    accountType,
    account,
    numbers: numbers.values,
    niche: clipForPrompt(workspace.nicheBrief, NICHE_CHARS),
    entries,
    commands,
    tokens,
    basis,
    maxBytes: options.maxBytes,
  });
}

/**
 * Konu × hook matrisi: depo henüz uygulamıyorsa (`not_implemented`, Supabase P2 gelene dek) matris yok sayılır, brifing yine üretilir; başka hata fırlar.
 */
async function readTopicMatrix(repo: PanelRepository, wsId: string): Promise<TopicHookMatrix | undefined> {
  try {
    return await repo.getTopicHookMatrix(wsId);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "not_implemented") return undefined;
    throw error;
  }
}
