/**
 * Haftalık özet görünümü (`getWeeklyDigest`), depo uygulamalarının ORTAK hesabı: mock ve (Faz 1'de) Supabase deposu aynı
 * toplamları ve aynı kullanıcıya görünen sebep metinlerini kullanır. Dönem = `now`dan geriye 7 gün. İzlenme/takipçi
 * farkı Genel bakış ile aynı yardımcıdan gelir (`gains.ts`); yeni tutanlar Tutanlar ile AYNI süzgeçten çağıranca verilir
 * (`outliers`): sayılar ekranlar arasında çelişmez. Ölçülemeyen değer undefined'dır (0 değil), sebebi `unmeasuredReasons`'ta.
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { AccountSnapshot, ContentItem, MetricSnapshot } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import type { ContentAnalysis, Idea } from "@/lib/domain/intel";
import type { DigestContent, WeeklyDigest } from "@/lib/domain/notification";
import { DAY_MS } from "@/lib/time";
import { followersAt, gainedViews } from "@/lib/data/views/gains";

export const DIGEST_DAYS = 7;
const TOP_CONTENT_LIMIT = 3;
const NEW_OUTLIER_LIMIT = 5;
/** "Script hazır oldu" sayılan durumlar (durum geçmişi tutulmadığı için güncelleme zamanıyla yaklaşık). */
const SCRIPTED_OR_LATER: readonly Idea["status"][] = ["scripted", "scheduled", "published"];

export interface DigestInput {
  own: OwnAccount[];
  competitors: Competitor[];
  items: ContentItem[];
  /**
   * Tutan içerikler: izlenen rakiplerin, kademesi `OUTLIER_MIN_TIER` ve üstü içerikleri, lift'e göre azalan (Tutanlar
   * ekranıyla AYNI süzgeç; depo uygulaması kendi sorgusundan verir). Özet bunlardan dönemde yayınlananları alır.
   */
  outliers: ContentItem[];
  snapshotsByItem: Map<string, MetricSnapshot[]>;
  accountSnapshots: AccountSnapshot[];
  analyses: ContentAnalysis[];
  ideas: Idea[];
}

const ms = (iso: string | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);

export function buildWeeklyDigest(input: DigestInput, now: Date): WeeklyDigest {
  const end = now.getTime();
  const start = end - DIGEST_DAYS * DAY_MS;
  const inPeriod = (iso: string | undefined) => ms(iso) > start && ms(iso) <= end;
  const analysisByItem = new Map(input.analyses.map((a) => [a.contentItemId, a]));
  const unmeasuredReasons: WeeklyDigest["unmeasuredReasons"] = {};

  // ---- Kendi hesap
  const ownIds = new Set(input.own.map((a) => a.id));
  const ownItems = input.items.filter((c) => c.owner.kind === "own" && ownIds.has(c.owner.id));
  const ownSnaps = input.accountSnapshots.filter((s) => s.subjectKind === "own" && ownIds.has(s.subjectId));
  const followersStart = followersAt(ownSnaps, input.own, start);
  const followersEnd = followersAt(ownSnaps, input.own, end);
  const followersDelta = followersStart !== undefined && followersEnd !== undefined ? followersEnd - followersStart : undefined;
  if (followersDelta === undefined) unmeasuredReasons.followersDelta = "Dönem başı ve sonu için takipçi ölçümü yok.";

  const views = gainedViews(input.snapshotsByItem, ownItems, start, end);
  if (views === undefined) unmeasuredReasons.views = "Dönemde izlenmesi ölçülmüş kendi içerik yok.";

  const topContent: DigestContent[] = ownItems
    .filter((c) => inPeriod(c.publishedAt) && (c.score.lift !== undefined || c.metrics.views !== undefined))
    .sort(
      (a, b) =>
        (b.score.lift ?? Number.NEGATIVE_INFINITY) - (a.score.lift ?? Number.NEGATIVE_INFINITY) ||
        (b.metrics.views ?? Number.NEGATIVE_INFINITY) - (a.metrics.views ?? Number.NEGATIVE_INFINITY) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, TOP_CONTENT_LIMIT)
    .map((c) => ({ ...summarizeContent(c, analysisByItem.get(c.id)), views: c.metrics.views }));

  // ---- Rakipler (izlenen rakipler; Tutanlar ile aynı küme)
  const newOutliers = input.outliers
    .filter((c) => inPeriod(c.publishedAt))
    .slice(0, NEW_OUTLIER_LIMIT)
    .map((c) => summarizeContent(c, analysisByItem.get(c.id)));

  const posts = new Map<string, number>();
  const tracked = new Map(input.competitors.filter((c) => c.status === "tracked").map((c) => [c.id, c]));
  for (const c of input.items) {
    if (c.owner.kind === "competitor" && tracked.has(c.owner.id) && inPeriod(c.publishedAt)) {
      posts.set(c.owner.id, (posts.get(c.owner.id) ?? 0) + 1);
    }
  }
  const [topId, topPosts] = [...posts].sort((a, b) => b[1] - a[1] || (tracked.get(a[0])?.handle ?? "").localeCompare(tracked.get(b[0])?.handle ?? ""))[0] ?? [];
  const mostActive = topId !== undefined && topPosts !== undefined ? { competitorId: topId, handle: tracked.get(topId)?.handle ?? topId, posts: topPosts } : undefined;
  if (!mostActive) unmeasuredReasons.mostActive = "Dönemde izlenen rakiplerden tarihli içerik gelmedi.";

  return {
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(end).toISOString(),
    own: { followersDelta, views, topContent },
    competitors: { newOutliers, mostActive },
    ideas: {
      new: input.ideas.filter((i) => inPeriod(i.createdAt)).length,
      scripted: input.ideas.filter((i) => SCRIPTED_OR_LATER.includes(i.status) && inPeriod(i.updatedAt)).length,
    },
    unmeasuredReasons,
  };
}
