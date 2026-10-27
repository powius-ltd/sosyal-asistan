import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AdsProviderError } from "@/lib/ads/provider";
import { ADS_READ_PATHS, assertAdsReadPath, createZernioAdsClient } from "@/lib/ads/providers/zernio/client";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), "utf8"));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const noSleep = () => Promise.resolve();

describe("Zernio reklam istemcisi", () => {
  it("yalnız GET atar, anahtarı başlıkta taşır, sorguyu doğru kurar", async () => {
    const fetchImpl = vi.fn(async () => json(fixture("accounts")));
    const client = createZernioAdsClient({ apiKey: "k", fetchImpl, sleep: noSleep });
    const { accounts, dropped } = await client.listAdAccounts("z1");
    expect(accounts).toHaveLength(1);
    expect(dropped).toBe(0);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/ads/accounts?accountId=z1");
    expect(init.method).toBe("GET");
  });

  it("izin listesi: yalnız üç okuma yolu; başka yol (yazan uç dahil) fırlatır", () => {
    expect([...ADS_READ_PATHS].sort()).toEqual(["/ads/accounts", "/ads/insights", "/ads/tree"]);
    for (const ok of ADS_READ_PATHS) expect(() => assertAdsReadPath(ok)).not.toThrow();
    for (const bad of ["/ads/" + "create", "/ads/" + "boost", "/ads/abc/" + "sta" + "tus", "/ads/accounts/x", "/ads/accounts?x=1", "/accounts", "", "ads/tree"]) expect(() => assertAdsReadPath(bad), bad).toThrow(/izin/);
  });

  it("üç okuma da yalnız izin listesindeki yola gider", async () => {
    const fetchImpl = vi.fn(async () => json({}));
    const client = createZernioAdsClient({ apiKey: "k", fetchImpl, sleep: noSleep });
    await client.listAdAccounts("z");
    await client.listTree("z", { from: "a", to: "b" });
    await client.listDailyInsights("z", "act_1", { from: "a", to: "b" });
    const paths = fetchImpl.mock.calls.map((call) => new URL((call as unknown as [string])[0]).pathname.replace(/^\/api\/v\d+/, ""));
    expect(paths).toHaveLength(3);
    for (const path of paths) expect(ADS_READ_PATHS).toContain(path);
  });

  it.each([
    [401, "auth"],
    [403, "plan_required"],
    [404, "not_found"],
    [500, "unavailable"],
  ])("%i → %s", async (status, code) => {
    const client = createZernioAdsClient({ apiKey: "gizli", fetchImpl: async () => json(fixture("error-403"), status), sleep: noSleep });
    const error = await client.listAdAccounts("z1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdsProviderError);
    expect((error as AdsProviderError).code).toBe(code);
    expect((error as Error).message).not.toContain("gizli");
  });

  it("429: bir kez bekleyip yeniden dener; ikinci 429 rate_limited", async () => {
    const ok = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "1" })).mockResolvedValueOnce(json(fixture("accounts")));
    const sleep = vi.fn(noSleep);
    expect((await createZernioAdsClient({ apiKey: "k", fetchImpl: ok, sleep }).listAdAccounts("z")).accounts).toHaveLength(1);
    expect(sleep).toHaveBeenCalledWith(1000);
    const twice = vi.fn(async () => json({}, 429));
    const error = await createZernioAdsClient({ apiKey: "k", fetchImpl: twice, sleep: noSleep }).listAdAccounts("z").catch((e: unknown) => e);
    expect((error as AdsProviderError).code).toBe("rate_limited");
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("202 (backfill): bir kez bekleyip yeniden dener; ikinci 202 veri sayılmaz, unavailable", async () => {
    const pending = { campaigns: [], backfillPending: true };
    const sleep = vi.fn(noSleep);
    const ok = vi.fn().mockResolvedValueOnce(json(pending, 202, { "retry-after": "3" })).mockResolvedValueOnce(json(fixture("tree")));
    expect((await createZernioAdsClient({ apiKey: "k", fetchImpl: ok, sleep }).listTree("z", { from: "a", to: "b" })).campaigns).toHaveLength(1);
    expect(sleep).toHaveBeenCalledWith(3000);
    const twice = vi.fn(async () => json(pending, 202));
    const error = await createZernioAdsClient({ apiKey: "k", fetchImpl: twice, sleep: noSleep }).listTree("z", { from: "a", to: "b" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdsProviderError);
    expect((error as AdsProviderError).code).toBe("unavailable");
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("insights: after imleciyle sayfalar, sayfa tavanında durur", async () => {
    const pages = [{ data: [{ ad_id: "a", date_start: "2026-09-16" }], paging: { after: "x" } }, { data: [{ ad_id: "b", date_start: "2026-09-17" }] }];
    const fetchImpl = vi.fn(async () => json(pages.shift()));
    const { rows } = await createZernioAdsClient({ apiKey: "k", fetchImpl, sleep: noSleep }).listDailyInsights("z", "act_1", { from: "2026-09-16", to: "2026-09-17" });
    expect(rows.map((r) => r.ad_id)).toEqual(["a", "b"]);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain("after=x");
    const endless = vi.fn(async () => json({ data: [], paging: { after: "x" } }));
    await createZernioAdsClient({ apiKey: "k", fetchImpl: endless, sleep: noSleep }).listDailyInsights("z", "act_1", { from: "a", to: "b" });
    expect(endless).toHaveBeenCalledTimes(20);
  });

  it("ağaç: sayfaları birleştirir", async () => {
    const fetchImpl = vi.fn(async () => json(fixture("tree")));
    const { campaigns, dropped } = await createZernioAdsClient({ apiKey: "k", fetchImpl, sleep: noSleep }).listTree("z", { from: "2026-09-16", to: "2026-10-20" });
    expect(campaigns).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("sayfalar arası düşen öğe sayıları toplanır", async () => {
    const bad = { data: [{ ad_id: "a", date_start: "2026-09-16" }, "bozuk", null], paging: { after: "x" } };
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(bad)).mockResolvedValueOnce(json({ data: [42] }));
    const read = await createZernioAdsClient({ apiKey: "k", fetchImpl, sleep: noSleep }).listDailyInsights("z", "act_1", { from: "a", to: "b" });
    expect(read.rows).toHaveLength(1);
    expect(read.dropped).toBe(3);
  });
});
