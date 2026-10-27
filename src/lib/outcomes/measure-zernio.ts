/**
 * `measure:zernio` orkestrasyonu: kendi hesabın Reels sayıları Zernio'dan (ücretsiz, salt okunur) `content_items` +
 * `metric_snapshots`'a (`source = 'zernio'`) yazılır. Apify'a ve ücretli hiçbir servise gidilmez.
 *
 * - Zernio hesabı: çalışma alanının Instagram hesabıyla kullanıcı adı eşleşir (nokta / alt çizgi / büyük harf yok sayılır);
 *   tek Instagram hesabı varsa o seçilir. Gönderiler hesap kimliğiyle süzülür.
 * - Yeni Reels `content_items`'a eklenir (var olan satıra DOKUNULMAZ: skor önbelleği ve Apify verisi bozulmaz).
 * - Aynı içerik için aynı gün (İstanbul) ikinci çekim YENİ satır üretmez: değerler değiştiyse o günün satırı güncellenir,
 *   aynıysa dokunulmaz. Böylece günde iki çekim (09:00 / 21:00) günün son okumasını tutar ve D+1/3/7 noktaları şişmez.
 * - Ölçülemeyen alan NULL kalır (0 değil).
 */
import "server-only";

import { toDayKey } from "@/lib/format";
import type { ZernioStore, ZernioSnapshotRow } from "@/lib/outcomes/measure-zernio-store";
import type { ZernioClient } from "@/lib/zernio/client";
import { mapZernioPost, type MappedZernioPost, type SkipReason } from "@/lib/zernio/map";
import type { ZernioAccount } from "@/lib/zernio/schema";

export type ZernioMeasureOutcome = "completed" | "dry_run" | "no_account";

export interface ZernioMeasureOptions {
  workspaceId: string;
  /** Tek saat: ölçüm anı ve "aynı gün" kararı bu ana göre. */
  now: Date;
  dryRun: boolean;
  log?: (line: string) => void;
}

export interface ZernioMeasureResult {
  outcome: ZernioMeasureOutcome;
  dryRun: boolean;
  reels: number;
  skipped: Partial<Record<SkipReason | "other_account", number>>;
  contentCreated: number;
  contentExisting: number;
  snapshotsInserted: number;
  snapshotsUpdated: number;
  snapshotsUnchanged: number;
  notes: string[];
}

const normalizeHandle = (handle: string | null | undefined) => (handle ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Çalışma alanının Instagram hesabına karşılık gelen Zernio hesabı; bulunamazsa neden. */
export function chooseZernioAccount(accounts: readonly ZernioAccount[], ownHandles: readonly string[]): { account?: ZernioAccount; reason?: string } {
  const instagram = accounts.filter((a) => a.platform === "instagram" && a.isActive !== false);
  if (instagram.length === 0) return { reason: "Zernio'da bağlı Instagram hesabı yok." };
  const own = new Set(ownHandles.map(normalizeHandle));
  const matched = instagram.filter((a) => own.has(normalizeHandle(a.username)));
  if (matched.length === 1) return { account: matched[0] };
  if (matched.length === 0 && instagram.length > 0) return { reason: "Zernio'daki Instagram hesabı çalışma alanının hesabıyla eşleşmiyor (tek hesap olsa da yedek yok)." };
  return { reason: "Zernio'da birden çok Instagram hesabı çalışma alanının hesabıyla eşleşiyor." };
}

const same = (a: number | null | undefined, b: number | null | undefined) => (a ?? null) === (b ?? null);
const FIELDS = ["views", "likes", "comments", "shares", "saves", "reach", "avg_watch_sec", "owner_followers"] as const;

function snapshotRow(
  workspaceId: string,
  contentItemId: string,
  mapped: MappedZernioPost,
  capturedAt: string,
  followers: number | undefined,
): ZernioSnapshotRow {
  const m = mapped.metrics;
  return {
    workspace_id: workspaceId,
    content_item_id: contentItemId,
    captured_at: capturedAt,
    views: m.views ?? null,
    views_kind: m.views === undefined ? null : "ig_views",
    likes: m.likes ?? null,
    comments: m.comments ?? null,
    shares: m.shares ?? null,
    saves: m.saves ?? null,
    reach: m.reach ?? null,
    avg_watch_sec: m.avgWatchSec ?? null,
    owner_followers: followers ?? null,
    extra: m.extra,
    source: "zernio",
  };
}

export async function measureZernio(options: ZernioMeasureOptions, deps: { zernio: ZernioClient; store: ZernioStore }): Promise<ZernioMeasureResult> {
  const { zernio, store } = deps;
  const capturedAt = options.now.toISOString();
  const dayKey = toDayKey(options.now);
  const result: ZernioMeasureResult = {
    outcome: "completed",
    dryRun: options.dryRun,
    reels: 0,
    skipped: {},
    contentCreated: 0,
    contentExisting: 0,
    snapshotsInserted: 0,
    snapshotsUpdated: 0,
    snapshotsUnchanged: 0,
    notes: [],
  };

  const ownAccounts = await store.listInstagramAccounts(options.workspaceId);
  if (ownAccounts.length === 0) return { ...result, outcome: "no_account", notes: ["Çalışma alanında Instagram hesabı yok."] };
  const chosen = chooseZernioAccount(await zernio.listAccounts(), ownAccounts.map((a) => a.handle));
  if (!chosen.account) return { ...result, outcome: "no_account", notes: [chosen.reason ?? "Zernio hesabı bulunamadı."] };
  const zernioAccount = chosen.account;
  const ownAccount = ownAccounts.find((a) => normalizeHandle(a.handle) === normalizeHandle(zernioAccount.username)) ?? ownAccounts[0];

  const mapped: MappedZernioPost[] = [];
  for (const post of await zernio.listPosts()) {
    const accountId = post.platforms?.[0]?.accountId;
    if (accountId && accountId !== zernioAccount._id) {
      result.skipped.other_account = (result.skipped.other_account ?? 0) + 1;
      continue;
    }
    const outcome = mapZernioPost(post);
    if ("skipped" in outcome) {
      result.skipped[outcome.skipped] = (result.skipped[outcome.skipped] ?? 0) + 1;
    } else {
      mapped.push(outcome.mapped);
    }
  }
  result.reels = mapped.length;
  if (mapped.length === 0) return { ...result, outcome: options.dryRun ? "dry_run" : "completed", notes: ["Zernio'da ölçülecek yayınlanmış Reels yok."] };

  const existing = await store.findContentByExternalIds(options.workspaceId, mapped.map((m) => m.content.externalId));
  const followers = zernioAccount.followersCount ?? undefined;

  // Aynı gün (İstanbul) zernio satırları: son 48 saat yeter (gün sınırı + saat dilimi payı).
  const knownIds = [...existing.values()];
  const recent = knownIds.length === 0 ? [] : await store.listZernioSnapshotsSince(options.workspaceId, knownIds, new Date(options.now.getTime() - 48 * 3600 * 1000).toISOString());
  const todayByContent = new Map<string, (typeof recent)[number]>();
  for (const row of recent) {
    if (toDayKey(row.captured_at) === dayKey) todayByContent.set(row.content_item_id, row);
  }

  for (const item of mapped) {
    let contentId = existing.get(item.content.externalId);
    if (contentId) {
      result.contentExisting += 1;
    } else {
      result.contentCreated += 1;
      contentId = options.dryRun ? undefined : await store.insertContent(options.workspaceId, ownAccount.id, item.content);
    }

    const row = contentId ? snapshotRow(options.workspaceId, contentId, item, capturedAt, followers) : undefined;
    const today = contentId ? todayByContent.get(contentId) : undefined;
    if (today && row) {
      if (FIELDS.every((f) => same(today[f], row[f]))) {
        result.snapshotsUnchanged += 1;
      } else {
        result.snapshotsUpdated += 1;
        if (!options.dryRun) await store.updateSnapshot(today.id, row);
      }
    } else {
      result.snapshotsInserted += 1;
      if (row && !options.dryRun) await store.insertSnapshot(row);
    }
  }

  if (options.dryRun) result.outcome = "dry_run";
  return result;
}

/** Sonuç → CLI çıktısı (gizli değer ve kişisel veri yok). */
export function formatZernioResult(result: ZernioMeasureResult): string[] {
  const skipped = Object.entries(result.skipped).map(([k, n]) => `${k}: ${n}`).join(", ");
  return [
    `Zernio: ${result.reels} Reels${skipped ? ` (atlanan — ${skipped})` : ""}`,
    `İçerik: ${result.contentCreated} yeni, ${result.contentExisting} var`,
    `Ölçüm: ${result.snapshotsInserted} yeni satır, ${result.snapshotsUpdated} güncellendi (aynı gün), ${result.snapshotsUnchanged} değişmedi`,
    ...(result.dryRun ? ["Kuru koşu: hiçbir satır yazılmadı."] : []),
    ...result.notes.map((n) => `Not: ${n}`),
  ];
}
