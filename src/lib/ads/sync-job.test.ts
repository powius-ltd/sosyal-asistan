import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdsProviderError, type AdsProvider } from "@/lib/ads/provider";
import { runAdsSync, syncRange, type AdsSyncOptions } from "@/lib/ads/sync-job";
import type { AdminClient } from "@/lib/supabase/admin";

const store = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; externalAccountId: string; providerAccountId?: string; currency: string; resultLabel?: string }>,
  writeStructure: vi.fn(async () => ({ summary: { campaigns: 1, adSets: 1, ads: 2 }, adIds: new Map<string, string>() })),
  writeMetrics: vi.fn(async () => ({ rows: 3, skipped: 0, days: 2 })),
  markStarted: vi.fn(async () => 0),
  touch: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ads/sync-store", () => ({
  listStoredAdAccounts: async () => store.accounts,
  writeAdStructure: store.writeStructure,
  writeAdMetrics: store.writeMetrics,
  markAdsStartedOn: store.markStarted,
  touchAdAccount: store.touch,
}));

const NOW = new Date("2026-10-21T10:00:00Z");
const base = { client: {} as AdminClient, workspaceId: "w", workspaceSlug: "ornekstudyoapp", now: NOW };
const fakeProvider = (): AdsProvider => ({
  listAccounts: async () => [],
  listStructure: async () => ({ campaigns: [], adSets: [], ads: [], creatives: [], dropped: 0 }),
  dailyMetrics: async () => ({
    metrics: [
      { adExternalId: "a", date: "2026-10-19", spend: 1, impressions: 1 },
      { adExternalId: "a", date: "2026-10-20", spend: 1, impressions: 1 },
    ],
    dropped: 0,
  }),
});

beforeEach(() => {
  store.accounts = [{ id: "i", externalAccountId: "act_1", providerAccountId: "z1", currency: "TRY", resultLabel: "satın alma" }];
  store.writeStructure.mockClear();
  store.markStarted.mockClear();
  store.touch.mockClear();
  store.writeMetrics.mockClear();
});

describe("runAdsSync", () => {
  it("kayıtlı hesap yoksa no_account (anahtar bile aranmaz)", async () => {
    store.accounts = [];
    expect(await runAdsSync({ ...base, env: {} })).toEqual({ outcome: "no_account" });
  });

  it("anahtar yoksa key_missing: sağlayıcı kurulmaz, yazım yapılmaz (iş düşmez)", async () => {
    const makeProvider = vi.fn(fakeProvider);
    expect(await runAdsSync({ ...base, env: {}, makeProvider })).toEqual({ outcome: "key_missing" });
    expect(makeProvider).not.toHaveBeenCalled();
    expect(store.writeStructure).not.toHaveBeenCalled();
  });

  it("anahtar çalışma alanına özel seçilir: başka hesabın anahtarı kullanılmaz", async () => {
    const result = await runAdsSync({ ...base, workspaceSlug: "baska", env: { ZERNIO_API_KEY: "genel" }, makeProvider: fakeProvider });
    expect(result.outcome).toBe("key_missing");
  });

  it("eşitler ve sayıları verir", async () => {
    const makeProvider = vi.fn((args: Parameters<NonNullable<AdsSyncOptions["makeProvider"]>>[0]) => (void args, fakeProvider()));
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider });
    expect(result).toEqual({ outcome: "synced", counts: { accounts: 1, ads: 2, days: 2, rows: 3, unlinked: 0, skipped: 0, dropped: 0, emptyWrites: 0 } });
    expect(makeProvider.mock.calls[0]?.[0]).toMatchObject({ zernioAccountId: "z1", resultLabel: "satın alma", currency: "TRY", range: { from: "2026-09-17", to: "2026-10-21" } });
  });

  it("eşleşmeyen ölçü satırı (skipped) sayılır ve iş partial olur", async () => {
    store.writeMetrics.mockResolvedValueOnce({ rows: 3, skipped: 4, days: 2 });
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: fakeProvider });
    expect(result).toMatchObject({ outcome: "partial", counts: { rows: 3, skipped: 4 } });
  });

  it("düşen öğe (dropped) sayılır ve iş partial olur", async () => {
    const makeProvider = () => ({
      ...fakeProvider(),
      listStructure: async () => ({ campaigns: [], adSets: [], ads: [], creatives: [], dropped: 2 }),
      dailyMetrics: async () => ({ metrics: [{ adExternalId: "a", date: "2026-10-19", spend: 1, impressions: 1 }], dropped: 1 }),
    });
    expect(await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider })).toMatchObject({ outcome: "partial", counts: { dropped: 3 } });
  });

  it("ölçü geldi ama hiç satır yazılamadıysa partial; hiç ölçü gelmemesi partial değil", async () => {
    store.writeMetrics.mockResolvedValueOnce({ rows: 0, skipped: 0, days: 0 });
    expect(await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: fakeProvider })).toMatchObject({ outcome: "partial", counts: { emptyWrites: 1 } });
    store.writeMetrics.mockResolvedValueOnce({ rows: 0, skipped: 0, days: 0 });
    const noMetrics = () => ({ ...fakeProvider(), dailyMetrics: async () => ({ metrics: [], dropped: 0 }) });
    expect(await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: noMetrics })).toMatchObject({ outcome: "synced" });
  });

  it("yazımdan sonra reklamların başlangıç günü ilk ölçü gününden işaretlenir (pencere başı verilir)", async () => {
    await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: fakeProvider });
    expect(store.markStarted).toHaveBeenCalledTimes(1);
    const args = store.markStarted.mock.calls[0] as unknown as [unknown, unknown, Array<{ date: string }>, string];
    expect(args[2].map((m) => m.date)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(args[3]).toBe("2026-09-17");
  });

  it("bir hesabın sağlayıcı hatası sıradakini atlatmaz: hesap notlanır, diğeri yazılır, sonuç partial", async () => {
    store.accounts = [
      { id: "i1", externalAccountId: "act_1", providerAccountId: "z1", currency: "TRY" },
      { id: "i2", externalAccountId: "act_2", providerAccountId: "z2", currency: "TRY" },
      { id: "i3", externalAccountId: "act_3", providerAccountId: "z3", currency: "TRY" },
    ];
    const makeProvider = (args: { zernioAccountId: string }) => ({
      ...fakeProvider(),
      listStructure: async () => {
        if (args.zernioAccountId === "z1") throw new AdsProviderError("unavailable", "x");
        return { campaigns: [], adSets: [], ads: [], creatives: [], dropped: 0 };
      },
    });
    const logs: string[] = [];
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider, log: (line) => logs.push(line) });
    expect(result).toMatchObject({ outcome: "partial", counts: { accounts: 2 }, failures: [{ account: "act_1", error: "unavailable" }] });
    expect(store.writeStructure).toHaveBeenCalledTimes(2);
    expect(logs.some((line) => line.includes("act_1") && line.includes("unavailable"))).toBe(true);
  });

  it("hiçbir hesap yazılamazsa provider_error (ilk hatanın kodu, tüm hatalar failures'ta)", async () => {
    store.accounts = [
      { id: "i1", externalAccountId: "act_1", providerAccountId: "z1", currency: "TRY" },
      { id: "i2", externalAccountId: "act_2", providerAccountId: "z2", currency: "TRY" },
    ];
    const makeProvider = (args: { zernioAccountId: string }) => ({ ...fakeProvider(), listStructure: async () => { throw new AdsProviderError(args.zernioAccountId === "z1" ? "auth" : "unavailable", "x"); } });
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider });
    expect(result).toMatchObject({ outcome: "provider_error", error: "auth", failures: [{ account: "act_1", error: "auth" }, { account: "act_2", error: "unavailable" }] });
    expect(store.writeStructure).not.toHaveBeenCalled();
  });

  it("sağlayıcı dışı hata (kod hatası) yutulmaz", async () => {
    const makeProvider = () => ({ ...fakeProvider(), listStructure: async () => { throw new Error("beklenmeyen"); } });
    await expect(runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider })).rejects.toThrow("beklenmeyen");
  });

  it("hesap adı/durumu eşitlemede güncellenir (touchAdAccount); para birimi ve hedefe dokunulmaz", async () => {
    const makeProvider = () => ({ ...fakeProvider(), listAccounts: async () => [{ externalAccountId: "act_1", providerAccountId: "z1", label: "Mağaza", currency: "TRY", status: "disabled" as const }] });
    await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider });
    expect(store.touch).toHaveBeenCalledWith(base.client, "i", { status: "disabled", label: "Mağaza" });
  });

  it("hesap listede yoksa ya da liste okunamazsa eşitleme sürer, touch yapılmaz", async () => {
    await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: fakeProvider });
    expect(store.touch).not.toHaveBeenCalled();
    const failing = () => ({ ...fakeProvider(), listAccounts: async () => { throw new AdsProviderError("not_found", "x"); } });
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: failing });
    expect(result.outcome).toBe("synced");
    expect(store.touch).not.toHaveBeenCalled();
  });

  it("listedeki para birimi kayıtlıdan farklıysa o hesap hiçbir şey yazılmadan atlanır (currency_mismatch)", async () => {
    const makeProvider = () => ({ ...fakeProvider(), listAccounts: async () => [{ externalAccountId: "act_1", providerAccountId: "z1", currency: "USD", status: "active" as const }] });
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider });
    expect(result).toMatchObject({ outcome: "provider_error", error: "currency_mismatch", failures: [{ account: "act_1", error: "currency_mismatch" }] });
    expect(store.writeStructure).not.toHaveBeenCalled();
    expect(store.writeMetrics).not.toHaveBeenCalled();
  });

  it("Zernio hesabına bağlı olmayan kayıt atlanır", async () => {
    store.accounts = [{ id: "i", externalAccountId: "act_1", currency: "TRY" }];
    const result = await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider: fakeProvider });
    expect(result).toMatchObject({ outcome: "synced", counts: { accounts: 0, unlinked: 1 } });
  });

  it("sağlayıcı hatası (plan_required) iş hatası olarak döner, fırlatmaz", async () => {
    const makeProvider = () => ({ ...fakeProvider(), listStructure: async () => { throw new AdsProviderError("plan_required", "x"); } });
    expect(await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, makeProvider })).toMatchObject({ outcome: "provider_error", error: "plan_required" });
  });

  it("önizleme: hiçbir okuma ve yazım yapılmaz", async () => {
    const provider = fakeProvider();
    const listStructure = vi.spyOn(provider, "listStructure");
    await runAdsSync({ ...base, env: { ZERNIO_API_KEY: "k" }, dryRun: true, makeProvider: () => provider });
    expect(listStructure).not.toHaveBeenCalled();
    expect(store.writeStructure).not.toHaveBeenCalled();
    expect(store.touch).not.toHaveBeenCalled();
  });

  it("pencere: varsayılan 35 gün, üst sınır 90", () => {
    expect(syncRange(NOW)).toEqual({ from: "2026-09-17", to: "2026-10-21" });
    expect(syncRange(NOW, 500).from).toBe("2026-07-24");
  });
});
