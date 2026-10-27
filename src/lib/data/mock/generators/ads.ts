/**
 * Mock reklam verisi (deterministik; hesap/marka adı gömülmez). 2 hesap: biri `value` hedefli (TRY), biri hedefsiz (USD); 6 reklam;
 * `AD_MOCK_DAYS` günlük seri `nowDay` günü dahil geriye. Değerler kimlikten türetilir (`hashString`), rastgelelik yok. Bir kreatif
 * verilen kendi içeriğe bağlıdır. Örnek hesaplar `ws` çalışma alanına aittir.
 */
import { hashString } from "@/lib/data/mock/prng";
import { shiftDay, type AdDataset } from "@/lib/data/views/ads";
import type { Ad, AdCreative, AdDailyMetric } from "@/lib/domain/ads";

export const AD_MOCK_DAYS = 35;

/** Sabit kimlikler (UUID biçimli: Supabase ile aynı şekil). */
const id = (kind: number, n: number): string => `ad${kind}00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACCOUNT_VALUE = id(1, 1);
const ACCOUNT_PLAIN = id(1, 2);

/** `salt` ile 0..1 arası kararlı sayı. */
const unit = (salt: string): number => (hashString(salt) % 10_000) / 10_000;

interface AdSpec {
  n: number;
  adSet: number;
  name: string;
  base: number;
  /** Günlük değer çarpanı (getiri kalitesi) ve sonuç ölçülüyor mu. */
  quality: number;
  measuresResults: boolean;
  format: AdCreative["format"];
  linkedContentId?: string;
}

export function buildMockAds(workspaceId: string, nowDay: string, ownContentId: string | undefined): AdDataset {
  const accounts: AdDataset["accounts"] = [
    {
      id: ACCOUNT_VALUE, workspaceId, provider: "zernio", externalAccountId: "act_100000000001", providerAccountId: "zn_1", label: "Örnek reklam hesabı A", currency: "TRY", status: "active",
      goal: { kind: "value", resultLabel: "satın alma", targetReturn: 3, grossMargin: 0.4 },
    },
    { id: ACCOUNT_PLAIN, workspaceId, provider: "zernio", externalAccountId: "act_100000000002", providerAccountId: "zn_2", label: "Örnek reklam hesabı B", currency: "USD", status: "active" },
  ];
  const campaigns: AdDataset["campaigns"] = [
    { id: id(2, 1), accountId: ACCOUNT_VALUE, externalId: "c1", name: "Satış kampanyası", status: "active" },
    { id: id(2, 2), accountId: ACCOUNT_PLAIN, externalId: "c2", name: "Tanıtım kampanyası", status: "active" },
  ];
  const adSets: AdDataset["adSets"] = [
    { id: id(3, 1), campaignId: id(2, 1), externalId: "s1", name: "Geniş kitle", status: "active", dailyBudget: 300 },
    { id: id(3, 2), campaignId: id(2, 1), externalId: "s2", name: "Yeniden hedefleme", status: "active", dailyBudget: 150 },
    { id: id(3, 3), campaignId: id(2, 2), externalId: "s3", name: "İlgi alanı", status: "paused" },
  ];
  const specs: AdSpec[] = [
    { n: 1, adSet: 1, name: "Video 1", base: 120, quality: 1.6, measuresResults: true, format: "video", ...(ownContentId === undefined ? {} : { linkedContentId: ownContentId }) },
    { n: 2, adSet: 1, name: "Video 2", base: 100, quality: 0.7, measuresResults: true, format: "video" },
    { n: 3, adSet: 2, name: "Görsel 1", base: 60, quality: 1.1, measuresResults: true, format: "image" },
    { n: 4, adSet: 2, name: "Görsel 2", base: 40, quality: 0.4, measuresResults: true, format: "image" },
    { n: 5, adSet: 3, name: "Video 3", base: 20, quality: 1, measuresResults: false, format: "video" },
    { n: 6, adSet: 3, name: "Video 4", base: 15, quality: 1, measuresResults: false, format: "video" },
  ];
  const creatives: AdCreative[] = specs.map((s) => ({ id: id(4, s.n), externalId: `cr${s.n}`, format: s.format, aspect: "9:16", ...(s.linkedContentId === undefined ? {} : { sourceContentId: s.linkedContentId }) }));
  const ads: Ad[] = specs.map((s) => ({ id: id(5, s.n), adSetId: id(3, s.adSet), externalId: `ad${s.n}`, name: s.name, status: "active", creativeId: id(4, s.n), startedOn: shiftDay(nowDay, -(AD_MOCK_DAYS - 1)) }));

  const metrics: AdDailyMetric[] = [];
  for (const spec of specs) {
    for (let offset = AD_MOCK_DAYS - 1; offset >= 0; offset--) {
      const date = shiftDay(nowDay, -offset);
      const wobble = 0.8 + unit(`${spec.n}:${date}`) * 0.4;
      const spend = Math.round(spec.base * wobble * 100) / 100;
      const impressions = Math.round(spend * 90);
      const clicks = Math.round(impressions * 0.02 * wobble);
      const row: AdDailyMetric = { adId: id(5, spec.n), date, spend, impressions, clicks, reach: Math.round(impressions * 0.7), frequency: Math.round((1 + offset * 0.01) * 100) / 100 };
      if (spec.format === "video") Object.assign(row, { video3sViews: Math.round(impressions * 0.3), videoThruplays: Math.round(impressions * 0.1), avgWatchSec: 6 });
      if (spec.measuresResults) {
        const results = Math.max(0, Math.round(clicks * 0.05 * spec.quality));
        Object.assign(row, { results, resultValue: Math.round(results * 400 * spec.quality) });
      }
      metrics.push(row);
    }
  }
  return { accounts, campaigns, adSets, ads, creatives, metrics };
}
