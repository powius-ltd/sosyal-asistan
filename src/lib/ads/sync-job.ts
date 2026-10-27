/**
 * `ads_sync` işinin tek giriş noktası: işçi (`run-single.ts`) ve betik (`scripts/ads.mts sync`) AYNI işlevi çağırır. Anahtar seçimi, sağlayıcı ve
 * yazım burada; anahtar yoksa hiçbir çağrı yapılmaz (`key_missing`). YALNIZ OKUR (Zernio'dan) ve KENDİ veritabanına yazar; $0, onaysız.
 * Kayıtlı hesabı (`ad_accounts`, `npm run ads -- link`) olmayan çalışma alanında hiçbir sağlayıcı çağrısı yapılmaz (`no_account`).
 */
import "server-only";

import { AdsProviderError, type AdsProvider, type AdsProviderErrorCode } from "@/lib/ads/provider";
import { createZernioAdsProvider } from "@/lib/ads/providers/zernio";
import { currencyMatches } from "@/lib/ads/providers/zernio/map";
import { listStoredAdAccounts, markAdsStartedOn, touchAdAccount, writeAdMetrics, writeAdStructure, type StoredAdAccount } from "@/lib/ads/sync-store";
import { DAY_MS } from "@/lib/time";
import type { AdminClient } from "@/lib/supabase/admin";
import { pickZernioKey } from "@/lib/zernio/api-key";

/** Varsayılan pencere: yorgunluk (14 gün) ve ani kötüleşme (28 gün) kuralları için yeterli. */
export const ADS_SYNC_DEFAULT_DAYS = 35;
export const ADS_SYNC_MAX_DAYS = 90;

export interface AdsSyncCounts {
  accounts: number;
  ads: number;
  /** Ölçü yazılan farklı gün sayısı. */
  days: number;
  rows: number;
  /** Zernio hesap kimliği bağlanmamış, atlanan hesap. */
  unlinked: number;
  /** Yapıda bulunmayan reklama ait olduğu için yazılmayan ölçü satırı. */
  skipped: number;
  /** Sağlayıcı yanıtından alınamayan öğe (kimliği olmayan reklam, bozuk öğe/satır). */
  dropped: number;
  /** Ölçü satırı geldi ama hiçbiri yazılamayan hesap. */
  emptyWrites: number;
}

/** Eşitleme sorunsuz değilse (atlanan satır, düşen öğe, boş yazım) `partial`; sayılar `counts`ta. */
export const hasSyncIssues = (c: AdsSyncCounts): boolean => c.skipped > 0 || c.dropped > 0 || c.emptyWrites > 0;

/** Okunamayan hesap: bir hesabın sağlayıcı hatası sıradakileri durdurmaz; hesap ve hata kodu sonuçta kalır. */
export interface AdsSyncFailure {
  account: string;
  error: AdsProviderErrorCode;
}

/**
 * `provider_error`: okunmak istenen HİÇBİR hesap yazılamadı (ilk hatanın kodu). `partial`: en az bir hesap yazıldı ama başka hesap okunamadı
 * ya da atlanan/düşen öğe var. `synced`: sorunsuz.
 */
export type AdsSyncResult =
  | { outcome: "key_missing" }
  | { outcome: "no_account" }
  | { outcome: "provider_error"; error: AdsProviderErrorCode; counts: AdsSyncCounts; failures: readonly AdsSyncFailure[] }
  | { outcome: "partial"; counts: AdsSyncCounts; failures: readonly AdsSyncFailure[] }
  | { outcome: "synced"; counts: AdsSyncCounts };

export interface AdsSyncOptions {
  client: AdminClient;
  workspaceId: string;
  workspaceSlug?: string;
  now: Date;
  days?: number;
  env: Readonly<Record<string, string | undefined>>;
  /** Yalnız `--dry-run`: hiçbir ağ çağrısı ve yazım yapmadan ne yapılacağını döndürür. */
  dryRun?: boolean;
  /** Test için: sağlayıcıyı değiştirir. */
  makeProvider?: (args: { apiKey: string; zernioAccountId: string; currency: string; resultLabel?: string; range: { from: string; to: string } }) => AdsProvider;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export function syncRange(now: Date, days: number = ADS_SYNC_DEFAULT_DAYS): { from: string; to: string } {
  const span = Math.min(Math.max(Math.trunc(days), 1), ADS_SYNC_MAX_DAYS);
  const to = now.toISOString().slice(0, 10);
  return { from: new Date(now.getTime() - (span - 1) * DAY_MS).toISOString().slice(0, 10), to };
}

export async function runAdsSync(options: AdsSyncOptions): Promise<AdsSyncResult> {
  const log = options.log ?? (() => undefined);
  const stored = await listStoredAdAccounts(options.client, options.workspaceId);
  if (stored.length === 0) return { outcome: "no_account" };
  const key = pickZernioKey(options.workspaceSlug, options.env);
  if (key === undefined) return { outcome: "key_missing" };

  const range = syncRange(options.now, options.days);
  const counts: AdsSyncCounts = { accounts: 0, ads: 0, days: 0, rows: 0, unlinked: 0, skipped: 0, dropped: 0, emptyWrites: 0 };
  const days = new Set<string>();
  const failures: AdsSyncFailure[] = [];
  const make =
    options.makeProvider ??
    ((args) => createZernioAdsProvider({ apiKey: args.apiKey, zernioAccountId: args.zernioAccountId, currency: args.currency, ...(args.resultLabel === undefined ? {} : { resultLabel: args.resultLabel }), structureRange: args.range, ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }) }));

  for (const account of stored) {
    if (account.providerAccountId === undefined) {
      counts.unlinked += 1;
      log(`${account.externalAccountId}: Zernio hesap kimliği bağlanmamış, atlandı.`);
      continue;
    }
    try {
      await syncAccount(options, account, account.providerAccountId, key.apiKey, range, make, counts, days);
    } catch (error) {
      if (!(error instanceof AdsProviderError)) throw error;
      failures.push({ account: account.externalAccountId, error: error.code });
      log(`${account.externalAccountId}: okunamadı (${error.code}), sıradaki hesaba geçildi.`);
    }
  }
  counts.days = days.size;
  const first = failures[0];
  if (first !== undefined && counts.accounts === 0) return { outcome: "provider_error", error: first.error, counts, failures };
  if (failures.length > 0 || hasSyncIssues(counts)) return { outcome: "partial", counts, failures };
  return { outcome: "synced", counts };
}

async function syncAccount(
  options: AdsSyncOptions,
  account: StoredAdAccount,
  zernioAccountId: string,
  apiKey: string,
  range: { from: string; to: string },
  make: NonNullable<AdsSyncOptions["makeProvider"]>,
  counts: AdsSyncCounts,
  days: Set<string>,
): Promise<void> {
  const provider = make({ apiKey, zernioAccountId, currency: account.currency, ...(account.resultLabel === undefined ? {} : { resultLabel: account.resultLabel }), range });
  if (options.dryRun) {
    options.log?.(`[önizleme] ${account.externalAccountId}: ${range.from} → ${range.to} okunurdu (çağrı yapılmadı).`);
    counts.accounts += 1;
    return;
  }
  const listed = await readAccountInfo(provider, account, options.log);
  const structure = await provider.listStructure(account.externalAccountId);
  const read = await provider.dailyMetrics(account.externalAccountId, range);
  const { summary, adIds } = await writeAdStructure(options.client, options.workspaceId, account, structure);
  const written = await writeAdMetrics(options.client, options.workspaceId, adIds, read.metrics, options.now);
  await markAdsStartedOn(options.client, adIds, read.metrics, range.from);
  if (listed !== undefined) await touchAdAccount(options.client, account.id, { status: listed.status, ...(listed.label === undefined ? {} : { label: listed.label }) });
  counts.accounts += 1;
  counts.ads += summary.ads;
  counts.rows += written.rows;
  counts.skipped += written.skipped;
  counts.dropped += structure.dropped + read.dropped;
  if (read.metrics.length > 0 && written.rows === 0) counts.emptyWrites += 1;
  for (const metric of read.metrics) days.add(metric.date);
  options.log?.(`${account.externalAccountId}: ${summary.campaigns} kampanya, ${summary.ads} reklam, ${written.rows} günlük ölçü${written.skipped > 0 ? `, ${written.skipped} ölçü satırı eşleşmedi (yazılmadı)` : ""}${structure.dropped + read.dropped > 0 ? `, ${structure.dropped + read.dropped} öğe alınamadı` : ""}.`);
}

/**
 * Hesabın adı ve durumu sağlayıcıdan güncellenir (para birimi ve hedef değişmez). Bu uç belgede yok [V]: okunamazsa eşitleme DURMAZ (ad/durum eski
 * kalır). Ama hesap listede başka bir para birimiyle geliyorsa yazım yapılmadan `currency_mismatch` fırlar (sessiz yanlış birim yok).
 */
async function readAccountInfo(provider: AdsProvider, account: StoredAdAccount, log: AdsSyncOptions["log"]): Promise<{ label?: string; status: "active" | "disabled" | "unknown" } | undefined> {
  let listed: Awaited<ReturnType<AdsProvider["listAccounts"]>>;
  try {
    listed = await provider.listAccounts();
  } catch (error) {
    if (!(error instanceof AdsProviderError)) throw error;
    log?.(`${account.externalAccountId}: hesap adı/durumu okunamadı (${error.code}); eşitleme sürüyor.`);
    return undefined;
  }
  const found = listed.find((item) => item.externalAccountId === account.externalAccountId);
  if (found === undefined) return undefined;
  if (!currencyMatches(found.currency, account.currency)) {
    throw new AdsProviderError("currency_mismatch", `Hesap ${account.externalAccountId} para birimi ${found.currency}, kayıtlı ${account.currency}`);
  }
  return { status: found.status, ...(found.label === undefined ? {} : { label: found.label }) };
}
