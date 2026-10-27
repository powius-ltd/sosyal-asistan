/**
 * Reklam eşitleme yazımı · GERÇEK veritabanı (yerel Supabase). Test KENDİ çalışma alanını + hesabını kurar ve siler. Yerel Supabase kapalıysa ATLANIR.
 * Sağlayıcıya ağ çağrısı YOK: veri fixture'dan eşlenir.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapDailyMetrics, mapStructure } from "@/lib/ads/providers/zernio/map";
import { zernioInsightsResponseSchema, zernioTreeResponseSchema } from "@/lib/ads/providers/zernio/schema";
import { listStoredAdAccounts, markAdsStartedOn, writeAdMetrics, writeAdStructure } from "@/lib/ads/sync-store";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const name = status.env ? "reklam eşitleme yazımı" : `reklam eşitleme yazımı (ATLANDI: ${status.skipReason})`;
const fixture = (n: string): unknown => JSON.parse(readFileSync(new URL(`./providers/zernio/__fixtures__/${n}.json`, import.meta.url), "utf8"));

describe.skipIf(!status.env)(`${name} · DB`, { timeout: 60_000 }, () => {
  const env = status.env;
  const db: AdminClient = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const wsId = randomUUID();
  const otherWs = randomUUID();
  const tag = randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (!env) return;
    const ws = await db.from("workspaces").insert([{ id: wsId, name: "Reklam yazım testi", slug: `ads-${tag}` }, { id: otherWs, name: "Reklam yazım testi 2", slug: `ads2-${tag}` }]);
    if (ws.error) throw new Error(ws.error.message);
    const acc = await db.from("ad_accounts").insert([
      { workspace_id: wsId, external_account_id: "act_1000000001", currency: "TRY" },
      { workspace_id: otherWs, external_account_id: "act_9", currency: "USD" },
    ]);
    if (acc.error) throw new Error(acc.error.message);
  });
  afterAll(async () => {
    if (!env) return;
    await db.from("workspaces").delete().in("id", [wsId, otherWs]);
  });

  it("yalnız kendi çalışma alanının kayıtlı hesabı okunur", async () => {
    const accounts = await listStoredAdAccounts(db, wsId);
    expect(accounts.map((a) => [a.externalAccountId, a.currency])).toEqual([["act_1000000001", "TRY"]]);
  });

  it("iki kez yazınca satır sayısı değişmez; ölçülmeyen alan NULL", async () => {
    const [account] = await listStoredAdAccounts(db, wsId);
    if (!account) throw new Error("hesap yok");
    const structure = mapStructure(zernioTreeResponseSchema.parse(fixture("tree")).campaigns, account.externalAccountId);
    const { metrics } = mapDailyMetrics(zernioInsightsResponseSchema.parse(fixture("insights-35d")).data, "purchase");
    const count = async (table: "ad_campaigns" | "ad_sets" | "ads" | "ad_daily_metrics") => (await db.from(table).select("*", { count: "exact", head: true }).eq("workspace_id", wsId)).count;

    for (let round = 0; round < 2; round += 1) {
      const written = await writeAdStructure(db, wsId, account, structure);
      expect(written.summary).toEqual({ campaigns: 1, adSets: 1, ads: 1 });
      const m = await writeAdMetrics(db, wsId, written.adIds, metrics, new Date("2026-10-21T00:00:00Z"));
      expect(m).toEqual({ rows: 35, skipped: 0, days: 35 });
    }
    expect([await count("ad_campaigns"), await count("ad_sets"), await count("ads"), await count("ad_daily_metrics")]).toEqual([1, 1, 1, 35]);

    const { data } = await db.from("ad_daily_metrics").select("date, clicks, spend").eq("workspace_id", wsId).eq("date", "2026-09-19").single();
    expect(data?.clicks).toBeNull();
    expect(Number(data?.spend)).toBeGreaterThan(0);
  });

  it("başlangıç günü: pencere içinde başlayan reklam işaretlenir, yeniden eşitleme değeri silmez, daha eski veri öne çeker", async () => {
    const [account] = await listStoredAdAccounts(db, wsId);
    if (!account) throw new Error("hesap yok");
    const structure = mapStructure(zernioTreeResponseSchema.parse(fixture("tree")).campaigns, account.externalAccountId);
    const { metrics } = mapDailyMetrics(zernioInsightsResponseSchema.parse(fixture("insights-35d")).data, "purchase");
    const { adIds } = await writeAdStructure(db, wsId, account, structure);
    const startedOn = async () => (await db.from("ads").select("started_on").eq("workspace_id", wsId).single()).data?.started_on;
    expect(await markAdsStartedOn(db, adIds, metrics, "2026-09-10")).toBe(1);
    expect(await startedOn()).toBe("2026-09-16");
    await writeAdStructure(db, wsId, account, structure);
    expect(await startedOn(), "yapı yeniden yazılınca started_on silinmez").toBe("2026-09-16");
    await markAdsStartedOn(db, adIds, [{ adExternalId: "ad1", date: "2026-09-12", spend: 1, impressions: 1 }], "2026-09-10");
    expect(await startedOn()).toBe("2026-09-12");
    await markAdsStartedOn(db, adIds, metrics, "2026-09-10");
    expect(await startedOn(), "daha geç tarih geri yazılmaz").toBe("2026-09-12");
  });

  it("yapıda olmayan reklamın ölçüsü atlanır, yazılmaz", async () => {
    const m = await writeAdMetrics(db, wsId, new Map(), [{ adExternalId: "yok", date: "2026-10-01", spend: 1, impressions: 1 }], new Date());
    expect(m).toEqual({ rows: 0, skipped: 1, days: 0 });
  });
});
