/**
 * Karşılaştırma ekranı içgörüleri (`getInsights`): LLM'siz, yalnız mevcut içerik/ölçüm verisinden. Mock ve Supabase AYNI
 * fonksiyonu çağırır (`buildInsights`); Supabase yalnız girdi kümesini okur, hesabı SQL'e kopyalamaz.
 *
 * Kapsam (docs/FAZ2-PLAN.md §2a P1/P2): karşılaştırma satırları, süre kovası × lift, CTA türü × lift, hook türü × lift (yalnız
 * `ok` + doğrulanmış analizden), paylaşım saati/sıklık (+ en sık 3 saat), hashtag imzası, açıklama ön istatistiği, veri kalitesi
 * rozetleri, benzer boy havuzu. Parçalar: grup özeti `insights-groups.ts` (plan taslağıyla ortak; güven baz çizgisi tavanlı),
 * hook grupları `insights-hooks.ts`, paylaşım deseni `insights-posting.ts`, rozetler `insights-quality.ts`, CTA sınıflayıcı
 * `insights-cta.ts`; sonuç tipi `domain/insights.ts`'tedir. Kurallar: yalnız kısa videolar (`short_video`), pencere
 * = `now`dan geriye `days` gün, görüntüleme türleri karışmaz (`medianViewsInDominantKind`), ölçülemeyen değer `undefined` (0
 * değil), olgunlaşmamış (<3 gün) içeriğin lift'i özetlere girmez, saat/gün hedef kitle saat diliminde (`audienceZone`).
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import type { ComparisonRow, HashtagSignature, Insights, SimilarSizePool, UnmeasuredInsight } from "@/lib/domain/insights";
import { CTA_TYPES, DURATION_BUCKETS, durationBucketOf, type CtaType, type DurationBucket } from "@/lib/domain/taxonomy";
import type { VoiceStats } from "@/lib/domain/voice-profile";
import { DEFAULT_INSIGHTS_DAYS, MAX_INSIGHTS_DAYS, MIN_INSIGHTS_DAYS, type InsightsQuery } from "@/lib/data/queries";
import { classifyCta } from "@/lib/data/views/insights-cta";
import { definedNumbers, groupedLift, usableLift, viewsSample } from "@/lib/data/views/insights-groups";
import { hookTypeGroups, hookTypesUnmeasured, verifiedHookTypeById } from "@/lib/data/views/insights-hooks";
import { postingPattern } from "@/lib/data/views/insights-posting";
import { qualityBadges } from "@/lib/data/views/insights-quality";
import { audienceZone, type ZoneSource } from "@/lib/insights/audience-zone";
import type { AnalysisRef } from "@/lib/insights/types";
import { similarSize } from "@/lib/metrics/cross-account";
import { summarizeLifts } from "@/lib/metrics/hook-lift";
import { median } from "@/lib/metrics/stats";
import { medianViewsInDominantKind } from "@/lib/metrics/views-summary";
import type { Platform } from "@/lib/platforms/types";
import { foldTurkish } from "@/lib/text";
import { DAY_MS } from "@/lib/time";

export interface InsightsInput {
  /** Saat dilimi: `audienceTimeZone`, yoksa `timezone` (`audienceZone`). Tam `Workspace` de geçer. */
  workspace: ZoneSource;
  own: readonly OwnAccount[];
  competitors: readonly Competitor[];
  /** Kendi + rakip içerikleri (pencere dışı/başka sahip içerik süzülür). */
  items: readonly ContentItem[];
  /** Tek saat (pencerenin sonu; "son paylaşımdan bu yana gün"). */
  now: Date;
  /**
   * Konu eleğinin (`screen-topics`) niş dışı bulduğu içerik kimlikleri. Verilirse: hesap satırlarında "niş dışı" rozeti çıkar ve bu
   * içerikler süre/CTA/hook grup tablolarına girmez (niş dışı içerikten "tutan yön" öğrenilmez). Verilmezse elek çalışmamıştır: rozet yok.
   */
  offNicheContentIds?: readonly string[];
  /**
   * Video analizleri (hook türü grupları için). Yalnız `status = ok` ve `evidenceVerified` olanın hook türü sayılır
   * (`verifiedHookTypeById`). Verilmezse hook türü ölçülemez: `hookTypes` boş, sebep `unmeasured`'da.
   */
  analyses?: readonly AnalysisRef[];
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const SECOND_PERSON_EN = /\b(?:you|your|yours|yourself|you're|you'll)\b/;
const SECOND_PERSON_TR = /\b(?:sen|senin|sana|seni|sizin|size|siz)\b/;

export function insightsDays(days: number | undefined): number {
  const wanted = Number.isFinite(days) ? Math.floor(days as number) : DEFAULT_INSIGHTS_DAYS;
  return Math.min(Math.max(wanted, MIN_INSIGHTS_DAYS), MAX_INSIGHTS_DAYS);
}

interface Subject {
  kind: "own" | "competitor";
  id: string;
  handle: string;
  platform: Platform;
  followers?: number;
}

const ms = (iso: string | undefined) => (iso === undefined ? undefined : Date.parse(iso));

function hashtagSignature(videos: readonly ContentItem[]): HashtagSignature {
  const videosByTag = new Map<string, number>();
  for (const c of videos) for (const tag of new Set(c.hashtags.map((t) => t.toLowerCase()))) videosByTag.set(tag, (videosByTag.get(tag) ?? 0) + 1);
  if (videosByTag.size === 0) return {};
  const [topTag, topTagVideos] = [...videosByTag].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  const withTags = videos.filter((c) => c.hashtags.length > 0).length;
  return {
    topTag,
    topTagVideos,
    topTagShare: topTagVideos / withTags,
    singleUseShare: [...videosByTag.values()].filter((n) => n === 1).length / videosByTag.size,
    medianTagCount: median(videos.map((c) => c.hashtags.length)),
  };
}

/** Açıklama metninden ön istatistik (LLM'siz). Açıklaması olmayan video örnekten çıkar; hiç açıklama yoksa ölçülemez. */
function voiceStats(videos: readonly ContentItem[]): VoiceStats {
  const captions = videos.flatMap((c) => (c.caption !== undefined && c.caption.trim() !== "" ? [c.caption] : []));
  const stats: VoiceStats = { sampleSize: captions.length, medianDurationSec: median(definedNumbers(videos.map((c) => c.durationSec))) };
  if (captions.length === 0) return stats;
  const folded = captions.map((text) => foldTurkish(text));
  stats.medianCaptionChars = median(captions.map((text) => Array.from(text).length));
  stats.questionShare = captions.filter((text) => text.includes("?")).length / captions.length;
  stats.emojiPerCaption = captions.reduce((sum, text) => sum + (text.match(EMOJI)?.length ?? 0), 0) / captions.length;
  stats.secondPersonShare = folded.filter((text) => SECOND_PERSON_EN.test(text) || SECOND_PERSON_TR.test(text)).length / captions.length;
  stats.medianHashtagCount = median(videos.map((c) => c.hashtags.length));
  return stats;
}

function comparisonRow(subject: Subject, videos: readonly ContentItem[], timeZone: string, nowMs: number, offNiche: ReadonlySet<string> | undefined): ComparisonRow {
  const views = medianViewsInDominantKind(videos.map(viewsSample)).median;
  // Olgunlaşmamış (<3 gün) içeriğin lift'i özete girmez (`usableLift`); hiçbiri ölçülemediyse medyan/tutan sayısı undefined.
  const lifts = summarizeLifts(videos.map(usableLift));
  const captioned = videos.filter((c) => classifyCta(c.caption) !== undefined);
  return {
    subjectKind: subject.kind,
    subjectId: subject.id,
    handle: subject.handle,
    platform: subject.platform,
    followers: subject.followers,
    videoCount: videos.length,
    medianViews: views,
    medianViewsPerFollower: views !== undefined && subject.followers !== undefined && subject.followers > 0 ? views / subject.followers : undefined,
    medianDurationSec: median(definedNumbers(videos.map((c) => c.durationSec))),
    medianLift: lifts.medianLift,
    // "0 tutan" ile "ölçülemedi" karışmaz: hiçbir videonun lift'i yoksa undefined.
    outlierCount: lifts.n === 0 ? undefined : lifts.outlierCount,
    commentCtaShare: captioned.length === 0 ? undefined : captioned.filter((c) => classifyCta(c.caption) === "comment_keyword").length / captioned.length,
    posting: postingPattern(videos, timeZone, nowMs),
    hashtags: hashtagSignature(videos),
    voice: voiceStats(videos),
    quality: qualityBadges(videos, offNiche),
  };
}

export function buildInsights(input: InsightsInput, query: InsightsQuery = {}): Insights {
  const days = insightsDays(query.days);
  const untilMs = input.now.getTime();
  const sinceMs = untilMs - days * DAY_MS;
  const timeZone = audienceZone(input.workspace);
  const offNiche = input.offNicheContentIds === undefined ? undefined : new Set(input.offNicheContentIds);

  const ownScope = input.own.filter((a) => query.accountId === undefined || a.id === query.accountId);
  const tracked = input.competitors.filter((c) => c.status === "tracked");
  const subjects: Subject[] = [
    ...ownScope.map((a): Subject => ({ kind: "own", id: a.id, handle: a.handle, platform: a.platform, followers: a.followers })),
    ...tracked.map((c): Subject => ({ kind: "competitor", id: c.id, handle: c.handle, platform: c.platform, followers: c.followers })),
  ];

  const videosBySubject = new Map<string, ContentItem[]>();
  for (const item of input.items) {
    const at = ms(item.publishedAt);
    if (item.format !== "short_video" || at === undefined || at < sinceMs || at > untilMs) continue;
    const key = `${item.owner.kind}:${item.owner.id}`;
    videosBySubject.set(key, [...(videosBySubject.get(key) ?? []), item]);
  }
  const videosOf = (s: Subject) => videosBySubject.get(`${s.kind}:${s.id}`) ?? [];

  const rows = subjects
    .map((s) => comparisonRow(s, videosOf(s), timeZone, untilMs, offNiche))
    .sort((a, b) => (a.subjectKind === b.subjectKind ? b.videoCount - a.videoCount || a.handle.localeCompare(b.handle) : a.subjectKind === "own" ? -1 : 1));

  const ownVideos = subjects.filter((s) => s.kind === "own").flatMap(videosOf);
  const rivalVideos = subjects.filter((s) => s.kind === "competitor").flatMap(videosOf);
  // Niş dışı içerik grup tablolarına girmez: ondan "tutan yön" öğrenilmez (rozet hesap satırında kalır).
  const inNiche = (c: ContentItem) => offNiche === undefined || !offNiche.has(c.id);
  const ownGrouped = ownVideos.filter(inNiche);
  const rivalGrouped = rivalVideos.filter(inNiche);
  const hookTypes = hookTypeGroups(ownGrouped, rivalGrouped, verifiedHookTypeById(input.analyses));

  const ownFollowers = ownScope.find((a) => a.followers !== undefined)?.followers;
  const pool = tracked.filter((c) => similarSize(ownFollowers, c.followers) === true);
  const similar: SimilarSizePool = { ownFollowers, count: pool.length, handles: pool.map((c) => c.handle).sort() };

  const unmeasured: UnmeasuredInsight[] = [];
  if (subjects.length === 0) unmeasured.push({ section: "comparison", reason: "Karşılaştırılacak kendi hesap ya da izlenen rakip yok." });
  if (ownVideos.length === 0 && ownScope.length > 0) {
    const reason = `Kendi hesabında son ${days} günde kısa video yok; ölçülemedi.`;
    for (const section of ["duration_buckets", "cta_types", "hook_types", "posting", "hashtags", "voice"] as const) unmeasured.push({ section, reason });
  } else if (tracked.length > 0 && rivalVideos.length === 0) {
    const reason = `İzlenen rakiplerde son ${days} günde kısa video yok; rakip tarafı ölçülemedi.`;
    for (const section of ["duration_buckets", "cta_types", "hook_types"] as const) unmeasured.push({ section, reason });
  }
  // Video yok sebebi zaten yazıldıysa hook türü için ikinci bir sebep eklenmez (bölüm başına tek sebep).
  const hookReason = unmeasured.some((u) => u.section === "hook_types")
    ? undefined
    : hookTypesUnmeasured(hookTypes, { analysesProvided: input.analyses !== undefined, hasOwnScope: ownScope.length > 0, hasTrackedRivals: tracked.length > 0 });
  if (hookReason) unmeasured.push(hookReason);
  if (ownFollowers === undefined) unmeasured.push({ section: "similar_size", reason: "Kendi takipçi sayısı ölçülemedi; benzer boy havuzu hesaplanamadı." });
  else if (tracked.length === 0) unmeasured.push({ section: "similar_size", reason: "İzlenen rakip yok." });

  return {
    scope: { accountId: query.accountId, days, since: new Date(sinceMs).toISOString(), until: new Date(untilMs).toISOString(), audienceTimeZone: timeZone },
    rows,
    durationBuckets: groupedLift<DurationBucket>(ownGrouped, rivalGrouped, (c) => durationBucketOf(c.durationSec), DURATION_BUCKETS),
    ctaTypes: groupedLift<CtaType>(ownGrouped, rivalGrouped, (c) => classifyCta(c.caption), CTA_TYPES),
    hookTypes,
    similarSize: similar,
    unmeasured,
  };
}
