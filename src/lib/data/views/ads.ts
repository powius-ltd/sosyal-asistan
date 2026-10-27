/**
 * Reklam raporunun saf hesabı (`getAdReport` / `getAdDetail` / `listAdUsage`): mock ve Supabase deposu AYNI fonksiyonu kullanır; depo yalnız
 * ham satırları (`AdDataset`) toplar. LLM yok, saat okunmaz (`now` verilir). Toplamlar + ölçüler + alışılmışa göre oran + KARAR (`lib/ads/**`:
 * baz çizgisi, seri ölçüleri, güven, karar). Karar dönem satırlarından verilir; eşikler `rules?` ile ezilebilir (varsayılan `DEFAULT_AD_RULES`).
 *
 * Kurallar: toplamı topla, sonra böl; ölçülemeyen `undefined` (0 değil). Rapor TEK hesabındır (para birimi karışmaz). Dönem `now` gününü
 * (Europe/Istanbul) dahil eder ve `days` gün geriye gider.
 *
 * Açık gün: dönemin son günü (`period.to` = `now`'ın günü) YARIMDIR; dönüşümler geç sayıldığı için o günün sonuç maliyeti şişer ve sahte
 * "kapat" / "ani kötüleşme" üretir. Bu yüzden o günün satırı hiçbir ölçüye, baz çizgisine ve karara girmez; yalnız `buildAdDetail().series`
 * içinde ham olarak görünür. Sonuç: 28 günlük varsayılan dönemde kapanmış gün 27'dir (ani kötüleşme 28 gün ister → "ölçülemedi").
 */
import { computeBaseline, vsBaselineOf } from "@/lib/ads/baseline";
import { daysBetween, shiftDay } from "@/lib/ads/days";
import { measureAd } from "@/lib/ads/metrics";
import { resolveAdRules, type AdRules } from "@/lib/ads/rules";
import { measureFatigue, measureStability, measureWorsening } from "@/lib/ads/series";
import { decideAd } from "@/lib/ads/verdict";
import { AD_PERIOD_DAYS_DEFAULT } from "@/lib/data/ad-schema";
import {
  adRefOf,
  type Ad,
  type AdAccount,
  type AdBaseline,
  type AdCampaign,
  type AdCreative,
  type AdDailyMetric,
  type AdDetail,
  type AdReport,
  type AdResult,
  type AdSet,
  type AdUsage,
} from "@/lib/domain/ads";
import { toDayKey } from "@/lib/format";

/** Depodan toplanan ham reklam satırları (çalışma alanı bazında; bir ya da birkaç hesap). */
export interface AdDataset {
  accounts: AdAccount[];
  campaigns: AdCampaign[];
  adSets: AdSet[];
  ads: Ad[];
  creatives: AdCreative[];
  metrics: AdDailyMetric[];
}

export interface AdPeriod {
  from: string;
  to: string;
  days: number;
}

export { shiftDay };

/** Dönem: `now`'dan önceki `days` kapanmış gün + yarım bugün (bugün karara girmez, yalnız ayrıntı serisinde görünür). */
export function adPeriodOf(now: Date, days: number = AD_PERIOD_DAYS_DEFAULT): AdPeriod {
  const to = toDayKey(now);
  if (to === undefined) throw new Error("Geçersiz zaman: reklam dönemi kurulamadı.");
  return { from: shiftDay(to, -days), to, days };
}

/** Hesapları görüntüleme sırasına dizer: ad, sonra kimlik (kararlı). */
export function sortAdAccounts(accounts: readonly AdAccount[]): AdAccount[] {
  return [...accounts].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "", "tr") || a.id.localeCompare(b.id));
}

interface AccountView {
  campaigns: Map<string, AdCampaign>;
  adSets: Map<string, AdSet>;
  ads: Ad[];
  creatives: Map<string, AdCreative>;
}

function accountView(data: AdDataset, accountId: string): AccountView {
  const campaigns = new Map(data.campaigns.filter((c) => c.accountId === accountId).map((c) => [c.id, c]));
  const adSets = new Map(data.adSets.filter((s) => campaigns.has(s.campaignId)).map((s) => [s.id, s]));
  const ads = data.ads.filter((a) => adSets.has(a.adSetId));
  return { campaigns, adSets, ads, creatives: new Map(data.creatives.map((c) => [c.id, c])) };
}

function resultOf(ad: Ad, account: AdAccount, view: AccountView, rows: readonly AdDailyMetric[], baseline: AdBaseline | undefined, period: AdPeriod, rules: AdRules): AdResult {
  const { sums, metrics } = measureAd(rows);
  const creative = ad.creativeId === undefined ? undefined : view.creatives.get(ad.creativeId);
  const campaignName = view.campaigns.get(view.adSets.get(ad.adSetId)?.campaignId ?? "")?.name;
  const ageDays = ad.startedOn === undefined ? sums.days : Math.max(0, daysBetween(ad.startedOn, period.to) + 1);
  const verdict = decideAd({
    goal: account.goal,
    sums,
    metrics,
    baseline,
    ageDays,
    fatigue: measureFatigue(rows, rules),
    stability: measureStability(rows, rules),
    worsening: measureWorsening(rows, rules),
    rules,
  });
  return {
    ad,
    ...(creative === undefined ? {} : { creative }),
    ...(campaignName === undefined ? {} : { campaignName }),
    sums,
    metrics,
    vsBaseline: vsBaselineOf(metrics, baseline),
    verdict,
  };
}

const inPeriod = (row: AdDailyMetric, period: AdPeriod): boolean => row.date >= period.from && row.date <= period.to;
/** Kapanmış gün: dönem içinde ve açık gün (`period.to`) değil. Ölçüler ve karar yalnız bunlardan kurulur. */
const inClosedDays = (row: AdDailyMetric, period: AdPeriod): boolean => row.date >= period.from && row.date < period.to;

/** Bir hesabın dönem raporu. `account` `data.accounts` içinden gelir; `rules` varsayılan eşiklerin üstüne biner. */
export function buildAdReport(data: AdDataset, account: AdAccount, period: AdPeriod, rules?: Partial<AdRules>): AdReport {
  const view = accountView(data, account.id);
  const adIds = new Set(view.ads.map((ad) => ad.id));
  const rows = data.metrics.filter((row) => adIds.has(row.adId) && inClosedDays(row, period));
  const { sums: totalSums, metrics: totalMetrics } = measureAd(rows);
  const byAd = Map.groupBy(rows, (row) => row.adId);
  const { baseline } = computeBaseline(byAd);
  const resolved = resolveAdRules(rules);
  const ads = view.ads
    .map((ad) => resultOf(ad, account, view, byAd.get(ad.id) ?? [], baseline, period, resolved))
    .sort((a, b) => b.sums.spend - a.sums.spend || a.ad.name.localeCompare(b.ad.name, "tr") || a.ad.id.localeCompare(b.ad.id));
  const unlinkedCount = ads.filter((result) => result.creative?.sourceContentId === undefined).length;
  return { period, account, totals: { sums: totalSums, metrics: totalMetrics }, ...(baseline === undefined ? {} : { baseline }), ads, unlinkedCount };
}

/** Tek reklamın ayrıntısı; reklam bu veri kümesinde yoksa `undefined`. */
export function buildAdDetail(data: AdDataset, adId: string, period: AdPeriod, rules?: Partial<AdRules>): AdDetail | undefined {
  const ad = data.ads.find((candidate) => candidate.id === adId);
  const adSet = ad === undefined ? undefined : data.adSets.find((s) => s.id === ad.adSetId);
  const campaign = adSet === undefined ? undefined : data.campaigns.find((c) => c.id === adSet.campaignId);
  const account = campaign === undefined ? undefined : data.accounts.find((a) => a.id === campaign.accountId);
  if (ad === undefined || account === undefined) return undefined;
  const report = buildAdReport(data, account, period, rules);
  const result = report.ads.find((item) => item.ad.id === adId);
  if (result === undefined) return undefined;
  const series = data.metrics.filter((row) => row.adId === adId && inPeriod(row, period)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    account,
    period,
    result,
    ...(campaign === undefined ? {} : { campaignName: campaign.name }),
    ...(adSet === undefined ? {} : { adSetName: adSet.name }),
    ...(report.baseline === undefined ? {} : { baseline: report.baseline }),
    series,
  };
}

/**
 * İçeriklerin reklam kullanımı: satır yalnız içerik en az bir kreatife bağlıysa vardır. R0'da karar yok → işaret `unmeasured`
 * (kreatif var, yargılanan yok), güven düşük. R1/R4 kararlardan işareti türetir.
 */
export function buildAdUsage(data: AdDataset, contentIds: readonly string[]): AdUsage[] {
  const wanted = new Set(contentIds);
  const creativesByContent = Map.groupBy(
    data.creatives.filter((creative) => creative.sourceContentId !== undefined && wanted.has(creative.sourceContentId)),
    (creative) => creative.sourceContentId as string,
  );
  const usages: AdUsage[] = [];
  for (const [contentItemId, creatives] of creativesByContent) {
    const creativeIds = new Set(creatives.map((creative) => creative.id));
    const adRefs = data.ads.filter((ad) => ad.creativeId !== undefined && creativeIds.has(ad.creativeId)).map((ad) => adRefOf(ad.id)).sort();
    usages.push({ contentItemId, creativeCount: creatives.length, signal: "unmeasured", confidence: "low", adRefs });
  }
  return usages.sort((a, b) => a.contentItemId.localeCompare(b.contentItemId));
}
