/**
 * Sözleşme süiti reklam tohumu: mock üretecinin (`generators/ads.ts`) çıktısını AYNEN yazar (kimlikler yeniden üretilir; iki depo aynı şekli
 * görür). Günler `MOCK_NOW` etrafındadır: sözleşme `AD_CONTRACT_NOW` ile sorar (gerçek saatten bağımsız). Yalnız `*.db.test.ts` kullanır.
 */
import { randomUUID } from "node:crypto";

import { buildMockAds } from "@/lib/data/mock/generators/ads";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { must } from "@/lib/data/supabase/testing/seed-ops";
import type { AdminClient } from "@/lib/supabase/admin";

/** Sözleşmenin reklam sorgularında kullandığı "şimdi" (tohum günleri buna göredir). */
export const AD_CONTRACT_NOW = new Date(MOCK_NOW);

export async function seedAds(db: AdminClient, wsId: string, ownContentId: string): Promise<void> {
  const data = buildMockAds(wsId, MOCK_NOW.slice(0, 10), ownContentId);
  const remap = new Map<string, string>();
  const fresh = (id: string): string => {
    const found = remap.get(id);
    if (found !== undefined) return found;
    const created = randomUUID();
    remap.set(id, created);
    return created;
  };
  must(
    await db.from("ad_accounts").insert(
      data.accounts.map((a) => ({
        id: fresh(a.id), workspace_id: wsId, provider: a.provider, external_account_id: a.externalAccountId, provider_account_id: a.providerAccountId ?? null,
        label: a.label ?? null, currency: a.currency, status: a.status,
        goal_kind: a.goal?.kind ?? null, result_label: a.goal?.resultLabel ?? null, target_return: a.goal?.targetReturn ?? null,
        gross_margin: a.goal?.grossMargin ?? null, target_cost_per_result: a.goal?.targetCostPerResult ?? null,
      })),
    ),
    "ad_accounts",
  );
  must(await db.from("ad_campaigns").insert(data.campaigns.map((c) => ({ id: fresh(c.id), workspace_id: wsId, account_id: fresh(c.accountId), external_id: c.externalId, name: c.name, status: c.status }))), "ad_campaigns");
  must(
    await db.from("ad_sets").insert(data.adSets.map((s) => ({ id: fresh(s.id), workspace_id: wsId, campaign_id: fresh(s.campaignId), external_id: s.externalId, name: s.name, status: s.status, daily_budget: s.dailyBudget ?? null }))),
    "ad_sets",
  );
  // Kreatif hangi hesaba aitse o hesabın altındadır: mock kreatifi reklamından bulunur.
  const accountOfCreative = new Map<string, string>();
  for (const ad of data.ads) {
    const campaignId = data.adSets.find((s) => s.id === ad.adSetId)?.campaignId;
    const accountId = data.campaigns.find((c) => c.id === campaignId)?.accountId;
    if (ad.creativeId !== undefined && accountId !== undefined) accountOfCreative.set(ad.creativeId, accountId);
  }
  must(
    await db.from("ad_creatives").insert(
      data.creatives.map((c) => ({
        id: fresh(c.id), workspace_id: wsId, account_id: fresh(accountOfCreative.get(c.id) ?? ""), external_id: c.externalId ?? null, format: c.format, aspect: c.aspect ?? null, source_content_id: c.sourceContentId ?? null,
      })),
    ),
    "ad_creatives",
  );
  must(
    await db.from("ads").insert(
      data.ads.map((a) => ({ id: fresh(a.id), workspace_id: wsId, ad_set_id: fresh(a.adSetId), creative_id: a.creativeId === undefined ? null : fresh(a.creativeId), external_id: a.externalId, name: a.name, status: a.status, started_on: a.startedOn ?? null })),
    ),
    "ads",
  );
  const rows = data.metrics.map((m) => ({
    ad_id: fresh(m.adId), date: m.date, workspace_id: wsId, spend: m.spend, impressions: m.impressions, clicks: m.clicks ?? null, results: m.results ?? null, result_value: m.resultValue ?? null,
    frequency: m.frequency ?? null, reach: m.reach ?? null, video_3s_views: m.video3sViews ?? null, video_thruplays: m.videoThruplays ?? null, avg_watch_sec: m.avgWatchSec ?? null,
  }));
  for (let i = 0; i < rows.length; i += 500) must(await db.from("ad_daily_metrics").insert(rows.slice(i, i + 500)), "ad_daily_metrics");
}
