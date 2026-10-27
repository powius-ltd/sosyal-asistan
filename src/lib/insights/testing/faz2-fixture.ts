/**
 * TEST VERİSİ (yalnız testler içe aktarır): docs/FAZ2-PLAN.md §1 "gerçek 40 içerikte bulgular"ı yeniden üretir — 1 kendi hesap
 * (Ornek, 10 Reels) + 3 rakip (noelle, align, evelyn; 10'ar Reels). Skorlar elle yazılmaz: `scoreAccount` ile hesaplanır (baz çizgisi
 * kuralları — sabitlenmiş/<3 gün/hedefin kendisi hariç — gerçekten uygulanır); `lift` hedefleri yalnız görüntülemeyi türetir.
 * Sahte ad: gerçek hesap/kişi verisi yok. Saat: 2026-09-30 12:00Z = 08:00 ET (Çarşamba); EDT (UTC−4).
 *
 * Bulgular (testlerde doğrulanır): Ornek 10–25 sn (ort. 14,3) ve 6,9 günde bir, son paylaşım 19 gün önce · rakip tutanları 56/92/108/
 * 128 sn · <30 sn medyan lift ≈ 0,5 (0 tutan), ≥ 90 sn ≈ 1,2 (3 tutan) · yorum-anahtar-kelime CTA noelle 8/10, align 3/10, Ornek 0/10
 * · noelle 10/10 videoyu 07–08 ET'de, #renewyourmind 9/10 · medyan izlenme/takipçi Ornek 0,69, rakipler 0,06–0,09 · evelyn: 8/10
 * beğeni gizli, 7/10 video <3 gün, 2 video niş dışı · Ornek'in 50 etiketinin 47'si tekil.
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import { scoreAccount } from "@/lib/metrics/score-account";

export const FIXTURE_NOW = new Date("2026-09-30T12:00:00.000Z");
export const FIXTURE_WORKSPACE = { audienceTimeZone: "America/New_York", timezone: "Europe/Istanbul" } as const;
/** Gelecek hafta (Pzt): tüm günler geleceğte. Şimdiki hafta Pzt 2026-09-28'dir (Pzt/Sal geçmişte). */
export const NEXT_WEEK = "2026-10-05";
export const CURRENT_WEEK = "2026-09-28";

export const ORNEK_ID = "own-ornek";
const RENEW = "Comment RENEW below and I'll send it to you.";
const FUTURE = "Comment FUTURE SELF and I'll send you the workbook.";
const QUIET = "A quiet practice for a clearer mind.";

export interface FixtureSpec {
  id: string;
  /** Yayın günü (bugünden geriye, tam gün) ve ET saati; `hoursAgo` verilirse o kullanılır (çok yeni videolar için). */
  daysAgo?: number;
  hourEt?: number;
  minute?: number;
  hoursAgo?: number;
  dur: number;
  lift: number;
  caption?: string;
  tags?: string[];
  hiddenLikes?: boolean;
  pinned?: boolean;
}

export interface FixtureAccount {
  owner: { kind: "own" | "competitor"; id: string; handle: string; followers: number };
  /** Hesabın medyan izlenmesi; her videonun izlenmesi = taban × hedef lift. */
  medianViews: number;
  specs: FixtureSpec[];
}

const at = (s: FixtureSpec): string =>
  s.hoursAgo !== undefined
    ? new Date(FIXTURE_NOW.getTime() - s.hoursAgo * 3_600_000).toISOString()
    : new Date(Date.UTC(2026, 8, 30 - (s.daysAgo ?? 0), (s.hourEt ?? 12) + 4, s.minute ?? 0)).toISOString();

/** Ornek: 62 günde 10 Reels (her ~7 günde), son paylaşım 19 gün önce; süreler 10–25 sn (ort. 14,3); açıklamada CTA yok. */
function ornekSpecs(): FixtureSpec[] {
  const days = [19, 26, 33, 40, 47, 54, 61, 68, 75, 81];
  const hours = [7, 20, 12, 23, 21, 20, 18, 13, 22, 9];
  const durs = [10, 11, 12, 12, 13, 13, 14, 15, 18, 25];
  const lifts = [0.9, 1.3, 0.8, 1.0, 1.1, 1.2, 0.7, 0.6, 1.8, 1.0];
  return days.map((daysAgo, i) => {
    const tags = Array.from({ length: 5 }, (_, j) => `ornek${i}x${j}`);
    if (i === 1 || i === 3 || i === 5) tags[0] = `ornek${i - 1}x0`; // 3 tekrar → 50 etiketin 47'si tekil
    return { id: `ay${i + 1}`, daysAgo, hourEt: hours[i], minute: 15, dur: durs[i], lift: lifts[i], caption: QUIET, tags, hiddenLikes: false };
  });
}

const tagsFor = (handle: string, i: number, signature: boolean) => [...(signature ? ["renewyourmind"] : []), `${handle}${i}a`, `${handle}${i}b`];

/** noelle: her gün ~07:30 ET, 8/10 yorum CTA'sı, 9/10 #renewyourmind. */
function noelleSpecs(): FixtureSpec[] {
  const rows: [number, number, number, string | undefined][] = [
    [4, 92, 4.2, RENEW],
    [5, 28, 0.5, RENEW],
    [6, 108, 3.6, FUTURE],
    [7, 96, 1.3, RENEW],
    [8, 24, 0.55, RENEW],
    [10, 105, 1.5, FUTURE],
    [11, 20, 0.6, undefined],
    [12, 110, 1.0, RENEW],
    [13, 52, 1.0, RENEW],
    [14, 18, 0.35, undefined],
  ];
  return rows.map(([daysAgo, dur, lift, caption], i) => ({ id: `no${i + 1}`, daysAgo, hourEt: 7, minute: 30, dur, lift, caption: caption ?? QUIET, tags: tagsFor("noelle", i, i !== 9), hiddenLikes: false }));
}

/** align: ~1,25 günde bir, dağınık saat; 3/10 yorum CTA'sı (biri 0,04x: CTA tek başına açıklayıcı değil). */
function alignSpecs(): FixtureSpec[] {
  const rows: [number, number, number, number, string | undefined][] = [
    [4, 128, 5.4, 14, FUTURE],
    [5, 56, 4.0, 18, undefined],
    [7, 94, 1.2, 10, undefined],
    [8, 20, 0.04, 16, RENEW],
    [9, 97, 1.1, 12, RENEW],
    [11, 26, 0.6, 19, undefined],
    [12, 91, 0.9, 8, undefined],
    [13, 27, 0.5, 17, undefined],
    [15, 100, 0.8, 11, undefined],
    [16, 40, 0.9, 15, undefined],
  ];
  return rows.map(([daysAgo, dur, lift, hourEt, caption], i) => ({ id: `al${i + 1}`, daysAgo, hourEt, minute: 5 * i, dur, lift, caption: caption ?? QUIET, tags: tagsFor("align", i, false), hiddenLikes: false }));
}

/** evelyn: 7 video <3 gün (n=2–3 olgun), 8/10 beğeni gizli; al9 (olgun, yüksek lift) ve ev4 niş dışı. */
function evelynSpecs(): FixtureSpec[] {
  const young: [number, number][] = [[7, 95], [15, 40], [24, 35], [34, 30], [46, 22], [55, 50], [65, 120]];
  const specs: FixtureSpec[] = young.map(([hoursAgo, dur], i) => ({ id: `ev${i + 1}`, hoursAgo, dur, lift: 1.1, caption: QUIET, tags: tagsFor("evelyn", i, false), hiddenLikes: i >= 2 }));
  const old: [number, number, number][] = [[5, 100, 1.4], [8, 45, 3.2], [12, 15, 0.4]];
  old.forEach(([daysAgo, dur, lift], k) => specs.push({ id: `ev${8 + k}`, daysAgo, hourEt: 13 + k, dur, lift, caption: QUIET, tags: tagsFor("evelyn", 8 + k, false), hiddenLikes: true }));
  return specs;
}

const ACCOUNTS: FixtureAccount[] = [
  { owner: { kind: "own", id: ORNEK_ID, handle: "ornekhesap", followers: 1_450 }, medianViews: 1_000, specs: ornekSpecs() },
  { owner: { kind: "competitor", id: "rv-noelle", handle: "noelle", followers: 118_000 }, medianViews: 8_800, specs: noelleSpecs() },
  { owner: { kind: "competitor", id: "rv-align", handle: "align", followers: 61_000 }, medianViews: 4_900, specs: alignSpecs() },
  { owner: { kind: "competitor", id: "rv-evelyn", handle: "evelyn", followers: 40_000 }, medianViews: 2_400, specs: evelynSpecs() },
];

/** Ham tanımlardan skorlu içerikler: skor `scoreAccount` ile (baz çizgisi kuralları gerçek). */
export function buildItems(accounts: readonly FixtureAccount[] = ACCOUNTS): ContentItem[] {
  return accounts.flatMap(({ owner, medianViews, specs }) => {
    const raw = specs.map((s) => ({ s, views: Math.round(medianViews * s.lift), publishedAt: at(s) }));
    const scores = scoreAccount(
      raw.map(({ s, views, publishedAt }) => ({ id: s.id, format: "short_video" as const, publishedAt: new Date(publishedAt), isPinned: s.pinned ? (true as const) : undefined, views, viewsKind: "ig_play_count" as const })),
      owner.followers,
      FIXTURE_NOW,
    );
    return raw.map(({ s, views, publishedAt }): ContentItem => ({
      id: s.id,
      workspaceId: "ws",
      platform: "instagram",
      externalId: `ext-${s.id}`,
      owner: { kind: owner.kind, id: owner.id, handle: owner.handle, followers: owner.followers },
      format: "short_video",
      publishedAt,
      caption: s.caption,
      hashtags: s.tags ?? [],
      durationSec: s.dur,
      isPinned: s.pinned ? true : undefined,
      missingFields: [],
      metrics: { views, viewsKind: "ig_play_count", likes: s.hiddenLikes ? undefined : Math.round(views * 0.05), extra: {} },
      score: scores.get(s.id) ?? { lowConfidence: true, immature: false },
      hasTranscript: false,
      firstSeenAt: "2026-09-29T00:00:00.000Z",
    }));
  });
}

export const FIXTURE_OWN: OwnAccount[] = [
  { id: ORNEK_ID, workspaceId: "ws", platform: "instagram", handle: "ornekhesap", followers: 1_450, connection: "scrape_only", scopes: [], createdAt: "2026-01-01T00:00:00.000Z" },
];

const rival = (id: string, handle: string, followers: number, status: Competitor["status"] = "tracked"): Competitor => ({
  id, workspaceId: "ws", platform: "instagram", handle, followers, status, source: "manual", missingFields: [], contentCount: 10, addedAt: "2026-09-01T00:00:00.000Z",
});

export const FIXTURE_COMPETITORS: Competitor[] = [rival("rv-noelle", "noelle", 118_000), rival("rv-align", "align", 61_000), rival("rv-evelyn", "evelyn", 40_000)];

/** Konu eleğinin niş dışı bulduğu iki evelyn videosu (ev4 genç, ev9 olgun ve yüksek lift'li: tutan sayılmamalı). */
export const FIXTURE_OFF_NICHE = ["ev4", "ev9"] as const;

export const fixtureItems = buildItems();
