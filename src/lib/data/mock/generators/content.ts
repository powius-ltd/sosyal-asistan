/**
 * Mock üreteci: içerikler (~300) + metrik snapshot'ları.
 *
 * Her hesap planı için: yayın zamanları (son 90 gün, İstanbul'da gündüz saatleri), format karışımı,
 * konu/hook (altyazı ve transcript aynı hook'tan), olgun izlenme (takipçi × oran × gürültü × ekilen
 * "tutan" çarpanı) ve büyüme eğrisiyle snapshot geçmişi. Son metrikler = son snapshot.
 * Skor alanları burada boş bırakılır; `scoring.ts` baz çizgisinden doldurur.
 */
import type { ContentItem, LatestMetrics, MetricSnapshot } from "@/lib/domain/content";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import type { HookSpec } from "@/lib/data/mock/catalog/topic-types";
import { postCaption, TOPICS, videoCaption } from "@/lib/data/mock/catalog/topics";
import type { AccountPlan } from "@/lib/data/mock/generators/accounts";
import {
  buildSnapshots,
  buildTruth,
  growthCurve,
  isVideoFormat,
  metricsAt,
  missingFieldsOf,
} from "@/lib/data/mock/generators/metrics";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { DAY_MS } from "@/lib/time";
import type { Rng } from "@/lib/data/mock/prng";

/** İçeriğin katalogdaki karşılığı (transcript/fikir üreteçleri kullanır; UI'a çıkmaz). */
export interface ContentMeta {
  topicKey: string;
  hook: HookSpec;
  ctaIndex: 0 | 1;
}

export interface ContentResult {
  items: ContentItem[];
  snapshots: MetricSnapshot[];
  meta: Map<string, ContentMeta>;
}

const HOUR_MS = 60 * 60 * 1000;
/** Europe/Istanbul sabit UTC+3 (2016'dan beri yaz saati yok). */
const IST_OFFSET_MS = 3 * HOUR_MS;
const POST_HOURS = [9, 12, 13, 18, 19, 20, 21] as const;
const SHORTCODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function formatList(rng: Rng, plan: AccountPlan): ContentFormat[] {
  const list: ContentFormat[] = [
    ...Array<ContentFormat>(plan.counts.short).fill("short_video"),
    ...Array<ContentFormat>(plan.counts.carousel).fill("carousel"),
    ...Array<ContentFormat>(plan.counts.image).fill("image"),
  ];
  const shuffled = rng.shuffle(list);
  // En yeni içerik hep kısa video (ci_001 = kendi hesabın en yeni Reels'i).
  const firstShort = shuffled.indexOf("short_video");
  if (firstShort > 0) [shuffled[0], shuffled[firstShort]] = [shuffled[firstShort], shuffled[0]];
  return shuffled;
}

/** Yaşlar (gün, yeniden eskiye) → İstanbul'da gündüz saatine oturtulmuş yayın anları. */
function publishTimes(rng: Rng, plan: AccountPlan, n: number, clock: MockClock): number[] {
  const [a0, a1] = plan.ageRange;
  const spacing = n > 1 ? (a1 - a0) / (n - 1) : 0;
  const latestAllowed = clock.nowMs - (plan.lastCollectedAge + 0.1) * DAY_MS;
  const oldestAllowed = clock.nowMs - 89.9 * DAY_MS;
  return Array.from({ length: n }, (_, i) => {
    const age = i === 0 ? a0 : a0 + i * spacing + rng.float(-0.3, 0.3) * spacing;
    const raw = clock.nowMs - Math.min(Math.max(age, a0), a1) * DAY_MS;
    const istDay = Math.floor((raw + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
    let ms = istDay + rng.pick(POST_HOURS) * HOUR_MS + rng.int(0, 59) * 60_000 - IST_OFFSET_MS;
    if (ms > latestAllowed) ms -= DAY_MS;
    if (ms < oldestAllowed) ms += DAY_MS;
    return Math.min(ms, latestAllowed);
  }).sort((x, y) => y - x);
}

function pickTopic(rng: Rng, plan: AccountPlan) {
  return rng.weighted(TOPICS.map((t) => [t, plan.topicBias.includes(t.key) ? 4 : 1] as const));
}

export function buildContent(rng: Rng, clock: MockClock, plans: AccountPlan[], addedAtMs: Map<string, number>): ContentResult {
  const items: ContentItem[] = [];
  const snapshots: MetricSnapshot[] = [];
  const meta = new Map<string, ContentMeta>();
  let seq = 0;

  for (const plan of plans) {
    const n = plan.counts.short + plan.counts.carousel + plan.counts.image;
    const formats = formatList(rng, plan);
    const times = publishTimes(rng, plan, n, clock);
    const lastCollectedMs = clock.nowMs - plan.lastCollectedAge * DAY_MS;
    const addedMs = addedAtMs.get(plan.id) ?? clock.nowMs - 90 * DAY_MS;

    // Eski aktörden gelen kısa videolar (en eski N tanesi) farklı viewsKind taşır.
    const shortIdxOldestFirst = formats.map((f, i) => (f === "short_video" ? i : -1)).filter((i) => i >= 0).reverse();
    const legacyIdx = new Set(plan.legacy ? shortIdxOldestFirst.slice(0, plan.legacy.oldestShorts) : []);

    // Ekilen tutan içerikler: yeterince büyümüş (≥1.5 gün) kısa videolardan.
    const grown = shortIdxOldestFirst.filter((i) => (clock.nowMs - times[i]) / DAY_MS >= 1.5);
    const planted = new Set(rng.shuffle(grown).slice(0, plan.outliers));
    const pinnable = [...planted].filter((i) => (clock.nowMs - times[i]) / DAY_MS > 20);
    const pinned = new Set(pinnable.slice(0, plan.ownerKind === "own" ? 1 : rng.int(1, 2)));

    for (let i = 0; i < n; i++) {
      const id = `ci_${String(++seq).padStart(3, "0")}`;
      const format = formats[i];
      const publishedMs = times[i];
      const ageDays = (clock.nowMs - publishedMs) / DAY_MS;
      const topic = pickTopic(rng, plan);
      const hook = rng.pick(topic.hooks);
      const video = isVideoFormat(format);

      const viewsKind: ViewsKind | undefined =
        !video && plan.ownerKind === "competitor" ? undefined : legacyIdx.has(i) && plan.legacy ? plan.legacy.kind : plan.viewsKind;
      const kindFactor = viewsKind === "ig_view_count" ? 0.6 : 1;
      const formatFactor = format === "carousel" ? 0.55 : format === "image" ? 0.35 : 1;
      const multiplier = planted.has(i)
        ? plan.ownerKind === "own" ? rng.float(2.6, 4.5) : rng.float(3.8, 9)
        : 1;
      const recency = 1 - (0.15 * ageDays) / 90;
      const views =
        viewsKind === undefined
          ? undefined
          : Math.round(plan.followersNow * plan.reachRatio * kindFactor * formatFactor * recency * Math.exp(rng.normal(0, 0.5)) * multiplier);
      const durationSec = video ? rng.int(18, 75) : undefined;
      const truth = buildTruth(rng, { plan, format, views, viewsKind, durationSec, ageDays });

      const firstSeenMs = Math.min(
        Math.max(publishedMs + (plan.source === "api" ? 0.05 : rng.float(0.2, 1.8)) * DAY_MS, addedMs),
        lastCollectedMs,
      );
      const itemSnapshots = buildSnapshots(id, truth, publishedMs, firstSeenMs, lastCollectedMs);
      snapshots.push(...itemSnapshots);
      // Son metrikler = son snapshot (son toplama anı).
      const latestMetrics: LatestMetrics = {
        ...metricsAt(truth, growthCurve((lastCollectedMs - publishedMs) / DAY_MS)),
        capturedAt: itemSnapshots[itemSnapshots.length - 1].capturedAt,
      };

      const instagram = plan.platform === "instagram";
      const shortcode = instagram
        ? rng.pick(["C", "D"]) + Array.from({ length: 10 }, () => rng.pick([...SHORTCODE_CHARS])).join("")
        : undefined;
      const externalId = (instagram ? "3" : "74") + Array.from({ length: instagram ? 18 : 17 }, () => rng.int(0, 9)).join("");

      items.push({
        id,
        workspaceId: WS,
        platform: plan.platform,
        externalId,
        shortcode,
        url: instagram
          ? `https://www.instagram.com/${video ? "reel" : "p"}/${shortcode}/`
          : `https://www.tiktok.com/@${plan.handle}/video/${externalId}`,
        owner: { kind: plan.ownerKind, id: plan.id, handle: plan.handle, displayName: plan.displayName, followers: plan.followersNow },
        format,
        publishedAt: new Date(publishedMs).toISOString(),
        caption: video ? videoCaption(topic, hook, i) : postCaption(topic, format === "carousel"),
        hashtags: [...topic.hashtags],
        durationSec,
        ...(pinned.has(i) ? { isPinned: true as const } : {}),
        isPaidPartnership: instagram ? rng.chance(plan.ownerKind === "own" ? 0.03 : 0.05) : undefined,
        missingFields: missingFieldsOf(latestMetrics, format),
        metrics: latestMetrics,
        score: { lowConfidence: true, immature: ageDays < 3 },
        hasTranscript: false,
        firstSeenAt: new Date(firstSeenMs).toISOString(),
      });
      meta.set(id, { topicKey: topic.key, hook, ctaIndex: (i % 2) as 0 | 1 });
    }
  }
  return { items, snapshots, meta };
}
