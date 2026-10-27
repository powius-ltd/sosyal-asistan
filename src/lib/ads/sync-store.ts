/**
 * Reklam eşitleme yazımı (service role): sağlayıcıdan okunan yapı ve günlük ölçüler `ad_*` tablolarına yazılır. İDEMPOTENT: her tablo kendi
 * doğal anahtarıyla upsert edilir (aynı veri iki kez yazılınca satır sayısı değişmez; ölçüde (reklam, gün) birincil anahtardır). YALNIZ kayıtlı
 * hesap (`ad_accounts` satırı) okunur/yazılır; hesap satırı bu dosyada AÇILMAZ (hedef ve para birimi kullanıcıdan gelir, `link` komutu yazar).
 * Reklam hesabına yazma yoktur: bu dosya yalnız KENDİ veritabanına yazar. Kişi verisi taşıyan alan tiplerde zaten yoktur.
 */
import "server-only";

import type { ProviderDailyMetric, ProviderStructure } from "@/lib/ads/provider";
import type { AdminClient } from "@/lib/supabase/admin";

/** Bir yazımda tek istekle gönderilen en çok satır. */
const CHUNK = 500;
/** `in (...)` süzgecinde tek istekle en çok kimlik (adres uzunluğu sınırı). */
const ID_CHUNK = 100;

export interface StoredAdAccount {
  id: string;
  externalAccountId: string;
  providerAccountId?: string;
  currency: string;
  resultLabel?: string;
}

export interface StructureWriteSummary {
  campaigns: number;
  adSets: number;
  ads: number;
}

export interface MetricWriteSummary {
  /** Yazılan (reklam, gün) satırı. */
  rows: number;
  /** Yapıda bulunmayan reklama ait olduğu için atlanan satır. */
  skipped: number;
  /** Ölçü olan farklı gün sayısı. */
  days: number;
}

function fail(table: string, message: string): never {
  throw new Error(`Reklam eşitleme yazımı başarısız (${table}): ${message}`);
}

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** Çalışma alanının kayıtlı reklam hesapları (yalnız Zernio sağlayıcısı). */
export async function listStoredAdAccounts(db: AdminClient, workspaceId: string): Promise<StoredAdAccount[]> {
  const { data, error } = await db
    .from("ad_accounts")
    .select("id, external_account_id, provider_account_id, currency, result_label")
    .eq("workspace_id", workspaceId)
    .eq("provider", "zernio")
    .order("created_at");
  if (error) fail("ad_accounts", error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    externalAccountId: row.external_account_id,
    ...(row.provider_account_id === null ? {} : { providerAccountId: row.provider_account_id }),
    currency: row.currency,
    ...(row.result_label === null ? {} : { resultLabel: row.result_label }),
  }));
}

async function upsertIds(db: AdminClient, table: "ad_campaigns" | "ad_sets" | "ads", rows: Record<string, unknown>[], onConflict: string, parentKey: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const part of chunks(rows)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tablo adı değişken; satır şekli çağıranda denetlenir
    const { data, error } = await (db.from(table) as any).upsert(part, { onConflict, defaultToNull: false }).select(`id, external_id, ${parentKey}`);
    if (error) fail(table, error.message);
    for (const row of (data ?? []) as Array<Record<string, string>>) ids.set(`${row[parentKey]}|${row.external_id}`, row.id);
  }
  return ids;
}

/** Yapıyı yazar; dönen harita reklamın sağlayıcı kimliğinden panel kimliğine (ölçü yazımı için). */
export async function writeAdStructure(
  db: AdminClient,
  workspaceId: string,
  account: Pick<StoredAdAccount, "id">,
  structure: ProviderStructure,
): Promise<{ summary: StructureWriteSummary; adIds: Map<string, string> }> {
  const campaignIds = await upsertIds(
    db,
    "ad_campaigns",
    structure.campaigns.map((c) => ({ workspace_id: workspaceId, account_id: account.id, external_id: c.externalId, name: c.name, status: c.status })),
    "account_id,external_id",
    "account_id",
  );
  const setRows: Record<string, unknown>[] = [];
  for (const s of structure.adSets) {
    const campaignId = campaignIds.get(`${account.id}|${s.campaignExternalId}`);
    if (campaignId === undefined) continue;
    setRows.push({ workspace_id: workspaceId, campaign_id: campaignId, external_id: s.externalId, name: s.name, status: s.status, daily_budget: s.dailyBudget ?? null });
  }
  const setIds = await upsertIds(db, "ad_sets", setRows, "campaign_id,external_id", "campaign_id");
  // Ad seti → kampanya eşlemesi: reklamın üst setini (kampanya kimliği + set dış kimliği) bulmak için.
  const campaignOfSet = new Map(structure.adSets.map((s) => [s.externalId, campaignIds.get(`${account.id}|${s.campaignExternalId}`)]));
  const adRows: Record<string, unknown>[] = [];
  for (const a of structure.ads) {
    const campaignId = campaignOfSet.get(a.adSetExternalId);
    const setId = campaignId === undefined ? undefined : setIds.get(`${campaignId}|${a.adSetExternalId}`);
    if (setId === undefined) continue;
    // `started_on` yalnız sağlayıcı verdiyse yazılır: yoksa upsert var olan değeri NULL'lamasın (`markAdsStartedOn` doldurur).
    adRows.push({ workspace_id: workspaceId, ad_set_id: setId, external_id: a.externalId, name: a.name, status: a.status, ...(a.startedOn === undefined ? {} : { started_on: a.startedOn }) });
  }
  const adSetIds = await upsertIds(db, "ads", adRows, "ad_set_id,external_id", "ad_set_id");
  const adIds = new Map<string, string>();
  for (const [key, id] of adSetIds) adIds.set(key.split("|")[1] ?? "", id);
  return { summary: { campaigns: campaignIds.size, adSets: setIds.size, ads: adIds.size }, adIds };
}

/** Günlük ölçüleri yazar (reklam, gün) anahtarıyla upsert. Ölçülmeyen alan NULL kalır (0 değil). */
export async function writeAdMetrics(
  db: AdminClient,
  workspaceId: string,
  adIds: ReadonlyMap<string, string>,
  metrics: readonly ProviderDailyMetric[],
  fetchedAt: Date,
): Promise<MetricWriteSummary> {
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const m of metrics) {
    const adId = adIds.get(m.adExternalId);
    if (adId === undefined) {
      skipped += 1;
      continue;
    }
    rows.push({
      ad_id: adId,
      date: m.date,
      workspace_id: workspaceId,
      spend: m.spend,
      impressions: Math.round(m.impressions),
      clicks: m.clicks === undefined ? null : Math.round(m.clicks),
      results: m.results ?? null,
      result_value: m.resultValue ?? null,
      frequency: m.frequency ?? null,
      reach: m.reach === undefined ? null : Math.round(m.reach),
      video_3s_views: m.video3sViews === undefined ? null : Math.round(m.video3sViews),
      video_thruplays: m.videoThruplays === undefined ? null : Math.round(m.videoThruplays),
      avg_watch_sec: m.avgWatchSec ?? null,
      fetched_at: fetchedAt.toISOString(),
    });
  }
  for (const part of chunks(rows)) {
    const { error } = await db.from("ad_daily_metrics").upsert(part as never, { onConflict: "ad_id,date" });
    if (error) fail("ad_daily_metrics", error.message);
  }
  return { rows: rows.length, skipped, days: new Set(rows.map((r) => r.date)).size };
}

/**
 * Reklamın yaşı için ilk ölçü günü. Zernio başlangıç tarihi vermez; ilk ölçü günü yalnız pencerenin İÇİNDE başlıyorsa (pencere başından sonra)
 * başlangıç sayılır: ilk gün pencerenin ilk günüyse reklam daha eskidir, tarih bilinmez (kayıt yok = bilinmiyor, uydurma tarih yok).
 */
export function startedOnByAd(metrics: readonly ProviderDailyMetric[], windowFrom: string): Map<string, string> {
  const first = new Map<string, string>();
  for (const m of metrics) {
    const seen = first.get(m.adExternalId);
    if (seen === undefined || m.date < seen) first.set(m.adExternalId, m.date);
  }
  for (const [ad, date] of first) if (date <= windowFrom) first.delete(ad);
  return first;
}

/** `ads.started_on`: yoksa ya da daha geç bir tarihse ilk ölçü gününe çekilir (daha geniş pencereli eşitleme tarihi öne alabilir; geri almaz). */
export async function markAdsStartedOn(db: AdminClient, adIds: ReadonlyMap<string, string>, metrics: readonly ProviderDailyMetric[], windowFrom: string): Promise<number> {
  const byDate = new Map<string, string[]>();
  for (const [adExternalId, date] of startedOnByAd(metrics, windowFrom)) {
    const id = adIds.get(adExternalId);
    if (id !== undefined) byDate.set(date, [...(byDate.get(date) ?? []), id]);
  }
  let marked = 0;
  for (const [date, ids] of byDate) {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const part = ids.slice(i, i + ID_CHUNK);
      const { error } = await db.from("ads").update({ started_on: date }).in("id", part).or(`started_on.is.null,started_on.gt.${date}`);
      if (error) fail("ads", error.message);
      marked += part.length;
    }
  }
  return marked;
}

/** Hesabın durumunu ve adını sağlayıcıdan gelenle günceller (para birimi ve hedef DEĞİŞMEZ). */
export async function touchAdAccount(db: AdminClient, accountId: string, patch: { label?: string; status: "active" | "disabled" | "unknown" }): Promise<void> {
  const { error } = await db
    .from("ad_accounts")
    .update({ status: patch.status, ...(patch.label === undefined ? {} : { label: patch.label }), updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) fail("ad_accounts", error.message);
}
