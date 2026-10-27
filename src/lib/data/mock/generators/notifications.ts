/**
 * Mock üreteci: 12 bildirim (6'sı okunmamış) + varsayılan uyarı ayarları. Bildirimler gerçek mock verisinden
 * türetilir: tutan rakip içerikleri (5), kendi tutan içeriklerin (2), iki haftalık özet (2) ve üç sistem olayı (3:
 * bağlantı süresi, gizli rakip, yeni benzer hesap önerileri). Her türün en yeni bildirimleri okunmamıştır.
 */
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import { OUTLIER_MIN_TIER, type ContentItem } from "@/lib/domain/content";
import type { Idea } from "@/lib/domain/intel";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings, type Notification, type NotificationKind } from "@/lib/domain/notification";
import { liftPhrase, PLAIN_TERMS, rivalSuggestionsPhrase } from "@/lib/plain-language";
import { truncateText } from "@/lib/text";
import { DAY_MS } from "@/lib/time";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import type { Rng } from "@/lib/data/mock/prng";

const HOUR_MS = 60 * 60 * 1000;
/** Her türde en yeni kaç bildirim okunmamış. */
const UNREAD_PER_KIND: Record<NotificationKind, number> = { competitor_outlier: 3, own_outlier: 1, weekly_digest: 1, system: 1, measurement_due: 0, idea_link_suggested: 0, onboarding: 0 };
/** Pazartesi 09:00 (Europe/Istanbul) = 06:00Z; mock "şimdi" Çarşamba 09:00Z → 2 gün 3 saat önce. */
const LAST_MONDAY_AGE_DAYS = 2 + 3 / 24;

type Draft = Omit<Notification, "id" | "workspaceId" | "readAt">;

export interface NotificationsResult {
  notifications: Notification[];
  alertSettings: AlertSettings;
}

export function buildNotifications(
  rng: Rng,
  clock: MockClock,
  input: { items: ContentItem[]; competitors: Competitor[]; ownAccounts: OwnAccount[]; ideas: Idea[] },
): NotificationsResult {
  const { items, competitors, ownAccounts, ideas } = input;
  const tracked = new Set(competitors.filter((c) => c.status === "tracked").map((c) => c.id));
  const cap = clock.nowMs - 5 * 60_000;
  const publishedMs = (c: ContentItem) => (c.publishedAt ? new Date(c.publishedAt).getTime() : 0);
  const newestFirst = (a: ContentItem, b: ContentItem) => publishedMs(b) - publishedMs(a);
  const isOutlier = (c: ContentItem) => (c.score.liftTier ?? 0) >= OUTLIER_MIN_TIER;
  const at = (ms: number) => new Date(Math.min(ms, cap)).toISOString();

  const drafts: Draft[] = [];

  const competitorOutliers = items.filter((c) => c.owner.kind === "competitor" && tracked.has(c.owner.id) && isOutlier(c)).sort(newestFirst);
  for (const c of competitorOutliers.slice(0, 5)) {
    drafts.push({
      kind: "competitor_outlier",
      title: `@${c.owner.handle} videosu ${liftPhrase(c.score.lift) ?? "çok izlendi"}`,
      body: `${truncateText(c.caption ?? "Alt yazı yok", 90)} · Rakibin hesabında ${PLAIN_TERMS.baseline.say} üstünde izleniyor.`,
      contentId: c.id,
      createdAt: at(publishedMs(c) + rng.float(6, 30) * HOUR_MS),
    });
  }

  const ownOutliers = items.filter((c) => c.owner.kind === "own" && isOutlier(c)).sort(newestFirst);
  for (const c of ownOutliers.slice(0, 2)) {
    drafts.push({
      kind: "own_outlier",
      title: `Videon ${liftPhrase(c.score.lift) ?? "çok izlendi"}`,
      body: `${truncateText(c.caption ?? "Alt yazı yok", 90)} · @${c.owner.handle} ${PLAIN_TERMS.baseline.say} üstünde izlendi.`,
      contentId: c.id,
      createdAt: at(publishedMs(c) + rng.float(6, 30) * HOUR_MS),
    });
  }

  for (const weeksBack of [0, 1]) {
    const endMs = clock.nowMs - (LAST_MONDAY_AGE_DAYS + 7 * weeksBack) * DAY_MS;
    const startMs = endMs - 7 * DAY_MS;
    const inWindow = (iso?: string) => iso !== undefined && new Date(iso).getTime() > startMs && new Date(iso).getTime() <= endMs;
    const outliers = competitorOutliers.filter((c) => inWindow(c.publishedAt)).length;
    const freshIdeas = ideas.filter((i) => inWindow(i.createdAt)).length;
    drafts.push({
      kind: "weekly_digest",
      title: "Haftalık özet hazır",
      body: `Geçen hafta ${outliers} tutan rakip içeriği ve ${freshIdeas} yeni fikir var. Ayrıntı için özeti aç.`,
      createdAt: at(endMs),
    });
  }

  const token = ownAccounts.find((a) => a.connection === "connected" && a.tokenExpiresAt);
  if (token?.tokenExpiresAt) {
    const days = Math.max(Math.round((new Date(token.tokenExpiresAt).getTime() - clock.nowMs) / DAY_MS), 0);
    drafts.push({
      kind: "system",
      title: "Instagram bağlantısı yakında yenilenmeli",
      body: `@${token.handle} erişim izninin süresi yaklaşık ${days} gün sonra doluyor; yayın ve ölçüm durmaması için Ayarlar'dan yenile.`,
      createdAt: clock.daysAgo(1.4),
    });
  }
  const hidden = competitors.find((c) => c.status === "private");
  if (hidden) {
    drafts.push({
      kind: "system",
      title: `@${hidden.handle} hesabı gizli`,
      body: "Hesap gizli olduğu için veri toplanamıyor. Herkese açık olursa izlenebilir; şimdilik listede “gizli” görünür.",
      createdAt: clock.daysAgo(6.5),
    });
  }
  const candidates = competitors.filter((c) => c.status === "candidate").length;
  if (candidates > 0) {
    drafts.push({
      kind: "system",
      title: `${rivalSuggestionsPhrase(candidates)} bulundu`,
      body: "Keşfet ekranında izlemeye alabileceğin hesaplar var; ilgili hesaplardan ve aramalardan geldiler.",
      createdAt: clock.daysAgo(3.2),
    });
  }

  // Kimlikler oluşturulma sırasıyla (eskiden yeniye); okunmamış = her türün en yeni N bildirimi.
  drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const seen: Record<NotificationKind, number> = { competitor_outlier: 0, own_outlier: 0, weekly_digest: 0, system: 0, measurement_due: 0, idea_link_suggested: 0, onboarding: 0 };
  const total: Record<NotificationKind, number> = { competitor_outlier: 0, own_outlier: 0, weekly_digest: 0, system: 0, measurement_due: 0, idea_link_suggested: 0, onboarding: 0 };
  for (const d of drafts) total[d.kind] += 1;

  const notifications = drafts.map<Notification>((draft, i) => {
    seen[draft.kind] += 1;
    const unread = seen[draft.kind] > total[draft.kind] - UNREAD_PER_KIND[draft.kind];
    return {
      id: `nt_${String(i + 1).padStart(2, "0")}`,
      workspaceId: WS,
      ...draft,
      readAt: unread ? undefined : at(new Date(draft.createdAt).getTime() + rng.float(1, 10) * HOUR_MS),
    };
  });

  return { notifications, alertSettings: structuredClone(DEFAULT_ALERT_SETTINGS) };
}
