/**
 * Sözleşme süiti test verisi (1/3): hesaplar, rakipler, içerik + skor önbelleği + metrik snapshot'ları + hesap snapshot'ları.
 * Skorlar ingest'in yazacağı gibi `lib/metrics` ile hesaplanıp `content_items`'a YAZILIR (okurken hesaplanmaz); böylece
 * sözleşme süitinin "önbellek = açıklama" ve "lift = views / baz çizgisi" kontrolleri gerçek veriyle sınanır.
 * Tüm zamanlar `now`a göredir (test her koşuda taze veri üretir); rastgelelik tohumludur (aynı `now` → aynı veri).
 */
import { randomUUID } from "node:crypto";

import { liftTierFor } from "@/lib/domain/content";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";
import { accountBaseline, crossScore, isYoung, scoreAccount, type ScorableItem } from "@/lib/metrics";
import { DAY_MS } from "@/lib/time";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";

export interface SeedOwner {
  kind: "own" | "competitor";
  id: string;
  handle: string;
  followers: number;
  viewsKind: ViewsKind;
  connected: boolean;
}

export interface SeedItem {
  id: string;
  owner: SeedOwner;
  externalId: string;
  format: ContentFormat;
  publishedAt: Date;
  views?: number;
  pinned: boolean;
  caption: string;
  missing: string[];
}

export interface SeedContent {
  owners: SeedOwner[];
  items: SeedItem[];
  itemRows: TablesInsert<"content_items">[];
  snapshotRows: TablesInsert<"metric_snapshots">[];
}

/** Tohumlu rastgele sayı üreteci (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ItemPlan {
  ageDays: number;
  /** Yayın saati (UTC); verilmezse yaşa göre değişir. */
  hourUtc?: number;
  /** Baz düzeye göre çarpan (verilmezse 0,7–1,3 arası rastgele); 3+ = tutan. */
  boost?: number;
  format?: ContentFormat;
  pinned?: boolean;
  noViews?: boolean;
}

export interface OwnerPlan {
  owner: SeedOwner;
  level: number;
  items: ItemPlan[];
}

const ages = (values: number[]): ItemPlan[] => values.map((ageDays) => ({ ageDays }));

/** En iyi paylaşım saati için: aynı hafta günü + saat (06:00 UTC = 09:00 Europe/Istanbul), 7 gün arayla 5 video. */
const SLOT_AGES = [10, 17, 24, 31, 38];
const SLOT_HOUR_UTC = 6;

export function buildOwners(ids: { ownConnected: string; ownScrape: string; c: string[] }): OwnerPlan[] {
  const own = (id: string, handle: string, followers: number, connected: boolean): SeedOwner => ({
    kind: "own", id, handle, followers, viewsKind: connected ? "ig_views" : "ig_play_count", connected,
  });
  const rival = (id: string, handle: string, followers: number): SeedOwner => ({
    kind: "competitor", id, handle, followers, viewsKind: "ig_play_count", connected: false,
  });
  const [c1, c2, c3, c4] = ids.c;
  return [
    {
      owner: own(ids.ownConnected, "test.hesap", 5000, true),
      level: 3000,
      items: [...ages([1, 4, 6, 12, 20, 45, 60, 80]), { ageDays: 15, format: "carousel", noViews: true }, { ageDays: 50, pinned: true }],
    },
    { owner: own(ids.ownScrape, "test.hesap2", 800, false), level: 700, items: ages([2, 9, 21, 40]) },
    {
      owner: rival(c1, "rakip.bir", 6000),
      level: 4000,
      items: [
        ...ages([2, 8, 16, 22, 40, 55, 70]),
        { ageDays: 5, boost: 5 },
        { ageDays: 12, boost: 3.5 },
        { ageDays: 30, boost: 4 },
        { ageDays: 18, format: "carousel", noViews: true },
        { ageDays: 33, format: "carousel", noViews: true },
      ],
    },
    { owner: rival(c2, "rakip.iki", 25000), level: 12000, items: [...ages([4, 9, 14, 26, 36, 48, 62, 75, 90]), { ageDays: 3, boost: 6 }, { ageDays: 20, boost: 3.2 }] },
    { owner: rival(c3, "rakip.uc", 300000), level: 90000, items: [...ages([3, 7, 15, 25, 35, 50, 65, 80, 95]), { ageDays: 8, boost: 3.4 }] },
    { owner: rival(c4, "yoksayilan", 5000), level: 4000, items: [...ages([7, 13, 21, 33, 47]), { ageDays: 6, boost: 5 }] },
  ];
}

const toScorable = (item: SeedItem): ScorableItem => ({
  id: item.id,
  format: item.format,
  publishedAt: item.publishedAt,
  isPinned: item.pinned ? true : undefined,
  views: item.views,
  viewsKind: item.views === undefined ? undefined : item.owner.viewsKind,
});

export function generateContent(wsId: string, plans: OwnerPlan[], now: Date): SeedContent {
  const rand = seededRandom(now.getUTCFullYear() * 1000 + now.getUTCDate());
  const items: SeedItem[] = [];
  for (const plan of plans) {
    const extra: ItemPlan[] = plan.owner.connected ? SLOT_AGES.map((ageDays) => ({ ageDays, boost: 1, hourUtc: SLOT_HOUR_UTC })) : [];
    [...plan.items, ...extra].forEach((p, index) => {
      const noViews = p.noViews === true;
      const at = new Date(now.getTime() - p.ageDays * DAY_MS);
      if (p.hourUtc !== undefined) at.setUTCHours(p.hourUtc, 0, 0, 0);
      else if (p.ageDays >= 8) at.setUTCHours(11 + (index % 3) * 3, 0, 0, 0);
      const views = noViews ? undefined : Math.round(plan.level * (p.boost ?? 0.7 + rand() * 0.6));
      items.push({
        id: randomUUID(),
        owner: plan.owner,
        externalId: `${plan.owner.handle}-${index}`,
        format: p.format ?? "short_video",
        publishedAt: at,
        views,
        pinned: p.pinned === true,
        caption: `${plan.owner.handle} içerik ${index}\n#kahve #ipucu`,
        missing: plan.owner.connected
          ? noViews ? ["views"] : []
          : noViews ? ["views", "shares", "saves", "reach", "avgWatchSec"] : ["shares", "saves", "reach", "avgWatchSec"],
      });
    });
  }
  return { owners: plans.map((p) => p.owner), items, ...scoreAndFlatten(wsId, items, now) };
}

function scoreAndFlatten(wsId: string, items: SeedItem[], now: Date) {
  const itemRows: TablesInsert<"content_items">[] = [];
  const snapshotRows: TablesInsert<"metric_snapshots">[] = [];
  const byOwner = new Map<string, SeedItem[]>();
  for (const item of items) byOwner.set(item.owner.id, [...(byOwner.get(item.owner.id) ?? []), item]);

  for (const group of byOwner.values()) {
    const owner = group[0].owner;
    const scorable = group.map(toScorable);
    const scores = scoreAccount(scorable, owner.followers, now);
    group.forEach((item, i) => {
      const score = scores.get(item.id);
      const baseline = accountBaseline(scorable, scorable[i], { now });
      const lift = score?.lift;
      const tier = lift === undefined ? undefined : liftTierFor(lift);
      const shortcode = `SC${item.externalId.replace(/[^a-z0-9]/gi, "")}`;
      itemRows.push({
        id: item.id,
        workspace_id: wsId,
        platform: "instagram",
        social_account_id: owner.kind === "own" ? owner.id : null,
        competitor_id: owner.kind === "competitor" ? owner.id : null,
        external_id: item.externalId,
        shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        format: item.format,
        published_at: item.publishedAt.toISOString(),
        caption: item.caption,
        hashtags: ["kahve", "ipucu"],
        duration_sec: 24,
        is_pinned: item.pinned ? true : null,
        missing_fields: item.missing,
        views_kind: score?.viewsKind ?? null,
        baseline_views: score?.baselineViews ?? null,
        baseline_n: score?.baselineN ?? null,
        baseline_excluded: {
          self: baseline.excluded.self,
          otherFormat: baseline.excluded.otherFormat,
          pinned: baseline.excluded.pinned,
          noViews: baseline.excluded.noViews,
          differentViewsKind: baseline.excluded.otherKind,
          noDate: baseline.excluded.noDate,
          tooYoung: baseline.excluded.young,
        },
        baseline_basis: baseline.basis.map((b): Json => ({ contentItemId: b.id, views: b.views, publishedAt: b.publishedAt.toISOString() })),
        lift: lift ?? null,
        lift_tier: tier ?? null,
        low_confidence: score?.lowConfidence ?? true,
        immature: isYoung(item.publishedAt, now),
        cross_score: crossScore(item.views, owner.followers) ?? null,
        scored_at: now.toISOString(),
      });
      snapshotRows.push(...snapshotsFor(wsId, item, now));
    });
  }
  return { itemRows, snapshotRows };
}

/** Yayından sonra artan izlenme serisi; son ölçüm `item.views`. Ölçülemeyen alan yazılmaz (NULL). */
function snapshotsFor(wsId: string, item: SeedItem, now: Date): TablesInsert<"metric_snapshots">[] {
  const published = item.publishedAt.getTime();
  const latestAt = new Date(Math.max(published + 3600_000, now.getTime() - 2 * 3600_000));
  const points =
    item.views === undefined
      ? [{ at: latestAt, share: 0 }]
      : [
          { at: new Date(published + DAY_MS), share: 0.3 },
          { at: new Date(published + 3 * DAY_MS), share: 0.7 },
          { at: latestAt, share: 1 },
        ].filter((p, i, all) => p.at.getTime() <= now.getTime() && (i === all.length - 1 || p.at.getTime() < latestAt.getTime()));
  return points.map((p) => {
    const views = item.views === undefined ? null : Math.round(item.views * p.share);
    const own = item.owner.connected;
    return {
      workspace_id: wsId,
      content_item_id: item.id,
      captured_at: p.at.toISOString(),
      views,
      views_kind: views === null ? null : item.owner.viewsKind,
      likes: views === null ? null : Math.round(views * 0.05),
      comments: views === null ? null : Math.round(views * 0.004),
      shares: own && views !== null ? Math.round(views * 0.01) : null,
      saves: own && views !== null ? Math.round(views * 0.02) : null,
      reach: own && views !== null ? Math.round(views * 1.2) : null,
      avg_watch_sec: own && views !== null ? 9.5 : null,
      owner_followers: item.owner.followers,
      source: own ? "graph_api" : "apify",
    };
  });
}

/** Hesap snapshot'ları: kendi hesaplar günlük (son 40 gün, artan), rakipler 1 gün ve 8 gün önce (haftalık fark için). */
export function accountSnapshotRows(wsId: string, owners: SeedOwner[], now: Date): TablesInsert<"account_snapshots">[] {
  const rows: TablesInsert<"account_snapshots">[] = [];
  for (const owner of owners) {
    const days = owner.kind === "own" ? Array.from({ length: 40 }, (_, d) => d) : [1, 8];
    for (const d of days) {
      rows.push({
        workspace_id: wsId,
        platform: "instagram",
        social_account_id: owner.kind === "own" ? owner.id : null,
        competitor_id: owner.kind === "competitor" ? owner.id : null,
        captured_at: new Date(now.getTime() - d * DAY_MS - 3600_000).toISOString(),
        followers: owner.followers - d * (owner.kind === "own" ? 6 : 25),
        source: owner.kind === "own" ? "graph_api" : "apify",
      });
    }
  }
  return rows;
}
