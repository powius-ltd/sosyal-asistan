/**
 * Genel bakışın Özet/plan/notlar için ek okumaları: her biri AYRI ayrı hataya dayanıklıdır (`readSafe`); biri fırlatırsa (ör.
 * `not_implemented`) yalnız o parça `undefined` kalır. Veri yalnız `PanelRepository` üzerinden; saat çağıranın `now`'ıdır.
 */
import type { PanelRepository } from "@/lib/data/repository";
import type { ContentItem } from "@/lib/domain/content";
import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { latestSuccessfulCollectionAt, type Briefing } from "@/lib/domain/briefing";
import type { MeasurementDue, WeekReview } from "@/lib/domain/outcomes";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { readSafe } from "@/lib/overview/read-safe";
import type { ActivityStat, OwnOutlierStat } from "@/lib/overview/types";
import { DAY_MS } from "@/lib/time";

/** Kendi tutanları ve etkinlik sayımı için dönem/pencere (gün). */
const ACTIVITY_DAYS = 7;
/** Listelenen kendi tutan video sayısı (sayı `total`'dan, en iyisi sıralamanın başından). */
const OWN_OUTLIER_LIMIT = 6;
/** Etkinlik sayımında en çok okunan koşu sayfası (sayfa başına ≤ 200 koşu). */
const MAX_RUN_PAGES = 5;
const RUN_PAGE_SIZE = 200;

const isoDaysAgo = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS).toISOString();

export interface OverviewExtras {
  /** Hiç not yoksa ya da okunamadıysa null. */
  briefing: Briefing | null;
  lastCollectedAt?: string;
  /** `undefined` = okunamadı; `null` = hiç plan yok. */
  plan?: WeeklyPlan | null;
  review?: WeekReview | null;
  ownOutlierItems?: ContentItem[];
  ownOutliers?: OwnOutlierStat;
  activity?: ActivityStat;
  newIdeas?: number;
  pendingApproval?: number;
  suggestedLinks?: number;
  measurementDue?: MeasurementDue[];
}

interface LoadArgs {
  repo: PanelRepository;
  wsId: string;
  now: Date;
  /** `?hesap=` ile seçili kendi hesap; yoksa tüm hesaplar. */
  accountId?: string;
  /** Kendi tutanların alt sınırı için dönem (gün; Genel bakış dönemiyle aynı). */
  periodDays: number;
}

/** Son 7 günde başarılı biten video analizi sayısı. Koşu `itemsIngested` taşıyorsa o, yoksa 1 sayılır (gerçekte koşu başına bir video). */
async function countRecentVideoAnalyses(repo: PanelRepository, wsId: string, now: Date): Promise<ActivityStat> {
  const since = isoDaysAgo(ACTIVITY_DAYS, now);
  let cursor: string | undefined;
  let analyzedVideos = 0;
  for (let page = 0; page < MAX_RUN_PAGES; page++) {
    const result = await repo.listRuns(wsId, { since, status: ["succeeded", "ingested"], limit: RUN_PAGE_SIZE, cursor });
    for (const run of result.items) if (run.kind === "video_analysis") analyzedVideos += run.itemsIngested ?? 1;
    if (result.nextCursor === undefined) return { analyzedVideos, truncated: false };
    cursor = result.nextCursor;
  }
  return { analyzedVideos, truncated: true };
}

/** En son plan + o haftanın sonucu ("Geçen hafta" okuması: kontrol noktaları, bağlar). */
async function loadPlanAndReview({ repo, wsId, now }: LoadArgs): Promise<Pick<OverviewExtras, "plan" | "review">> {
  const list = await readSafe("plan listesi", () => repo.listWeeklyPlans(wsId, { limit: 1 }));
  if (list === undefined) return {};
  const latest = list[0];
  if (!latest) return { plan: null, review: null };
  const [plan, review] = await Promise.all([
    readSafe("haftalık plan", () => repo.getWeeklyPlan(wsId, latest.weekStart)),
    readSafe("hafta sonucu", () => repo.getWeekReview(wsId, latest.weekStart, now)),
  ]);
  return { plan, review };
}

export async function loadOverviewExtras(args: LoadArgs): Promise<OverviewExtras> {
  const { repo, wsId, now, accountId, periodDays } = args;
  const [planAndReview, briefing, ingestedRuns, outliers, activity, digest, publish, links, due] = await Promise.all([
    loadPlanAndReview(args),
    readSafe("brifing", () => repo.getLatestBriefing(wsId)),
    readSafe("son toplama", () => repo.listRuns(wsId, { provider: "apify", status: "ingested", limit: 1 })),
    readSafe("kendi tutanlar", () =>
      repo.listContent(wsId, {
        ownerKind: "own",
        ownerId: accountId,
        minTier: OUTLIER_MIN_TIER,
        since: isoDaysAgo(periodDays, now),
        sort: "lift",
        limit: OWN_OUTLIER_LIMIT,
      }),
    ),
    readSafe("etkinlik", () => countRecentVideoAnalyses(repo, wsId, now)),
    readSafe("haftalık özet", () => repo.getWeeklyDigest(wsId, now)),
    readSafe("yayın özeti", () => repo.getPublishSummary(wsId, now)),
    readSafe("eşleşme önerileri", () => repo.listIdeaLinks(wsId, { status: "suggested" })),
    readSafe("ölçüm zamanı", () => repo.listMeasurementDue(wsId, now)),
  ]);

  const items = outliers?.items;
  const lifts = (items ?? []).flatMap((item) => (item.score.lift !== undefined && Number.isFinite(item.score.lift) ? [item.score.lift] : []));
  return {
    ...planAndReview,
    briefing: briefing ?? null,
    lastCollectedAt: ingestedRuns === undefined ? undefined : latestSuccessfulCollectionAt(ingestedRuns.items),
    ownOutlierItems: items,
    ownOutliers:
      outliers === undefined ? undefined : { count: outliers.total ?? outliers.items.length, bestLift: lifts.length > 0 ? Math.max(...lifts) : undefined },
    activity,
    newIdeas: digest?.ideas.new,
    pendingApproval: publish?.pendingApproval,
    suggestedLinks: links?.length,
    measurementDue: due,
  };
}
