/**
 * Orkestrasyon testleri: Apify/Supabase/skor bağımlılıkları sahte; para harcanmaz, ağ yok.
 * Asıl kanıtlar: bütçe ön kontrolü (tavan aşılırsa koşu YOK), tavan/kuru koşuda hiç çağrı yok, hedef hatasında
 * diğerlerinin sürmesi, gizli hesap için içerik koşusu açılmaması, başka hesabın içeriğinin yazılmaması.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "@/lib/apify/budget";
import type { BudgetedRun, BudgetedRunRequest } from "@/lib/apify/start";
import { collectOnce } from "@/lib/collection/collect-once";
import { loadTargets } from "@/lib/collection/targets";
import type { CollectDeps, CollectTarget } from "@/lib/collection/types";
import { loadFixture } from "@/lib/platforms/instagram/test-support";
import type { AdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/collection/targets", () => ({ loadTargets: vi.fn() }));

const WS = "7a3f0000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-30T12:00:00Z");

const TARGETS: CollectTarget[] = [
  { owner: { kind: "own", id: "o1" }, handle: "ornekhesap", platform: "instagram" },
  { owner: { kind: "competitor", id: "c1" }, handle: "ornekrakipbir", platform: "instagram" },
  { owner: { kind: "competitor", id: "c2" }, handle: "bad_target", platform: "instagram" },
  { owner: { kind: "competitor", id: "c3" }, handle: "ornekrakipiki", platform: "instagram" },
];

/** Her zincir çağrısı kendine döner; await edilince boş, hatasız sonuç verir (yazımlar no-op). */
function fakeClient(): AdminClient {
  const chain: unknown = new Proxy(function noop() {}, {
    get: (_target, prop) => {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      return () => chain;
    },
    apply: () => chain,
  });
  return { from: () => chain } as unknown as AdminClient;
}

function reelsFor(handle: string): Record<string, unknown>[] {
  return loadFixture("reel").map((row) => ({ ...row, inputUrl: `https://www.instagram.com/${handle}` }));
}

interface Harness {
  deps: CollectDeps;
  start: ReturnType<typeof vi.fn>;
  wait: ReturnType<typeof vi.fn>;
  datasetItems: ReturnType<typeof vi.fn>;
  recompute: ReturnType<typeof vi.fn>;
  startedLabels: () => string[];
}

function harness(overrides: { unitPrice?: number; profileRows?: Record<string, unknown>[]; startFails?: (request: BudgetedRunRequest, n: number) => Error | undefined } = {}): Harness {
  let n = 0;
  const unit = overrides.unitPrice ?? 0.0025;
  const start = vi.fn(async (request: BudgetedRunRequest): Promise<BudgetedRun> => {
    n += 1;
    const failure = overrides.startFails?.(request, n);
    if (failure) throw failure;
    return {
      run: { id: `run-${n}` },
      externalRunId: `ext-${n}`,
      datasetId: `${request.kind}|${request.targetLabel}`,
      estimate: { amountUsd: unit * request.expectedResults, priceUnknown: false },
    } as unknown as BudgetedRun;
  });
  const wait = vi.fn(async (runId: string) => ({ run: { runId, status: "SUCCEEDED" }, timedOut: false }));
  const datasetItems = vi.fn(async (datasetId: string) => {
    const [kind, label] = datasetId.split("|");
    if (kind === "profile") return overrides.profileRows ?? loadFixture("profile");
    // @ornekrakipiki'e BAŞKA hesabın reel'leri döner (ortak yazar benzeri): yazılmamalı.
    return label === "@ornekrakipiki" ? loadFixture("reel") : reelsFor(label.slice(1));
  });
  const recompute = vi.fn(async () => ({ owners: [], failures: [], items: 30 }));
  const deps: CollectDeps = {
    client: fakeClient(),
    estimate: async (_actor, results) => ({ amountUsd: unit * results, unitPriceUsd: unit, priceUnknown: false }),
    start,
    wait,
    datasetItems,
    recompute,
    // Test ağa çıkmaz: mutabakat denemeleri kapalı (reconcileWaitMs: 0) ve bu yedek de sahte.
    reconcile: async () => ({ outcome: "reconciled", actualUsd: 0.01, reservedUsd: 0.01 }),
    clock: () => NOW,
    sleep: async () => undefined,
  };
  return { deps, start, wait, datasetItems, recompute, startedLabels: () => start.mock.calls.map(([r]) => r.targetLabel as string) };
}

beforeEach(() => {
  vi.mocked(loadTargets).mockReset();
  vi.mocked(loadTargets).mockResolvedValue({ targets: TARGETS, skipped: [], ownViaZernio: [] });
});

describe("harcama tavanı ön kontrolü", () => {
  it("toplam tahmin > $0,20 → HİÇBİR koşu başlatılmaz (start/wait/dataset/skor çağrılmaz)", async () => {
    const h = harness({ unitPrice: 0.005 }); // 44 sonuç × 0,005 = 0,22
    const summary = await collectOnce({ workspaceId: WS, now: NOW }, h.deps);

    expect(summary.outcome).toBe("blocked");
    expect(summary.plan?.estimatedUsd).toBeCloseTo(0.22, 6);
    expect(summary.plan?.withinCeiling).toBe(false);
    expect(summary.notes.join(" ")).toMatch(/HİÇBİR koşu başlatılmadı/);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.wait).not.toHaveBeenCalled();
    expect(h.datasetItems).not.toHaveBeenCalled();
    expect(h.recompute).not.toHaveBeenCalled();
    expect(summary.runs).toEqual([]);
  });

  it("limit büyütülünce de tavan aşılır → koşu yok", async () => {
    const h = harness({ unitPrice: 0.0025 }); // limit 20: (4 + 80) × 0,0025 = 0,21
    const summary = await collectOnce({ workspaceId: WS, now: NOW, limit: 20 }, h.deps);
    expect(summary.outcome).toBe("blocked");
    expect(h.start).not.toHaveBeenCalled();
  });

  it("--dry-run: tavan içinde olsa bile koşu başlatılmaz; plan + tahmin döner", async () => {
    const h = harness();
    const summary = await collectOnce({ workspaceId: WS, now: NOW, dryRun: true }, h.deps);
    expect(summary.outcome).toBe("dry_run");
    expect(summary.plan?.jobs).toHaveLength(5);
    expect(summary.plan?.estimatedUsd).toBeCloseTo(0.11, 6);
    expect(summary.plan?.withinCeiling).toBe(true);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.recompute).not.toHaveBeenCalled();
  });

  it("hedef yoksa koşu yok", async () => {
    vi.mocked(loadTargets).mockResolvedValue({ targets: [], skipped: [], ownViaZernio: [] });
    const h = harness();
    const summary = await collectOnce({ workspaceId: WS, now: NOW }, h.deps);
    expect(summary.outcome).toBe("no_targets");
    expect(h.start).not.toHaveBeenCalled();
  });

  it("kendi hesap Zernio'dan okunuyorsa Apify'a gitmez ve notta adıyla söylenir (ölçümde hedef kalmaz)", async () => {
    vi.mocked(loadTargets).mockResolvedValue({ targets: [], skipped: [], ownViaZernio: ["@ornek"] });
    const h = harness();
    const summary = await collectOnce({ workspaceId: WS, now: NOW, ownOnly: true }, h.deps);
    expect(summary.outcome).toBe("no_targets");
    expect(summary.notes.join(" ")).toMatch(/Zernio'dan okunuyor.*@ornek/);
    expect(h.start).not.toHaveBeenCalled();
  });
});

describe("gerçek toplama akışı (sahte Apify)", () => {
  it("önce profil, sonra hedef başına reel koşusu; sonunda skor tek kez, tek saatle", async () => {
    const h = harness();
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);

    expect(summary.outcome).toBe("completed");
    expect(h.startedLabels()).toEqual(["profil (4 hesap)", "@ornekhesap", "@ornekrakipbir", "@bad_target", "@ornekrakipiki"]);
    expect(h.start.mock.calls[0][0]).toMatchObject({ workspaceId: WS, kind: "profile", expectedResults: 4 });
    expect(h.start.mock.calls[1][0]).toMatchObject({ kind: "content", expectedResults: 10 });
    expect(h.recompute).toHaveBeenCalledTimes(1);
    expect(h.recompute).toHaveBeenCalledWith(WS, NOW);
    expect(summary.scoring).toMatchObject({ items: 30, failures: [] });
  });

  it("bir hedef başarısız olursa diğerleri devam eder", async () => {
    const h = harness({ startFails: (request) => (request.targetLabel === "@bad_target" ? new Error("Apify API 500") : undefined) });
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);

    expect(summary.outcome).toBe("completed");
    expect(h.start).toHaveBeenCalledTimes(5); // başarısız olan dahil hepsi denendi
    const byHandle = new Map(summary.targets.map((t) => [t.handle, t]));
    expect(byHandle.get("bad_target")?.content?.error).toMatch(/Apify API 500/);
    expect(byHandle.get("ornekhesap")?.content).toMatchObject({ parsed: 10, ingested: 10 });
    expect(byHandle.get("ornekrakipbir")?.content).toMatchObject({ parsed: 10, ingested: 10 });
    expect(h.recompute).toHaveBeenCalledTimes(1);
  });

  it("başka hesabın içeriği (inputUrl farklı) hedef hesaba yazılmaz", async () => {
    const h = harness();
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    const align = summary.targets.find((t) => t.handle === "ornekrakipiki");
    expect(align?.content).toMatchObject({ parsed: 0, ingested: 0, skipped: 10 });
  });

  it("gizli rakip: profil koşusunda private çıkarsa reel koşusu HİÇ başlatılmaz", async () => {
    const profile = loadFixture("profile")[0];
    const profileRows = [
      { ...profile, username: "ornekhesap" },
      { ...profile, username: "ornekrakipbir", private: true },
    ];
    const h = harness({ profileRows });
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);

    expect(h.startedLabels()).not.toContain("@ornekrakipbir");
    const noelle = summary.targets.find((t) => t.handle === "ornekrakipbir");
    expect(noelle?.profile?.state).toBe("private");
    expect(noelle?.content?.skippedReason).toMatch(/private/);
  });

  it("profil koşusu başarısız olsa da reel koşuları sürer", async () => {
    const h = harness({ startFails: (request) => (request.kind === "profile" ? new Error("Apify API 503") : undefined) });
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    expect(h.startedLabels()).toHaveLength(5);
    expect(summary.targets.every((t) => t.profile?.state === "error")).toBe(true);
    expect(summary.targets.find((t) => t.handle === "ornekhesap")?.content?.ingested).toBe(10);
  });

  it("Apify koşusu SUCCEEDED değilse veri okunmaz; hedef hata ile raporlanır", async () => {
    const h = harness();
    h.wait.mockImplementation(async (runId: string) => ({ run: { runId, status: "FAILED" }, timedOut: false }));
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    expect(h.datasetItems).not.toHaveBeenCalled();
    expect(summary.targets.every((t) => t.content?.error?.includes("FAILED"))).toBe(true);
  });

  it("aylık tavan aşımı (BudgetExceededError) kalan koşuları durdurur", async () => {
    const h = harness({ startFails: (_request, n) => (n === 3 ? new BudgetExceededError(0.025, 9.99, 10) : undefined) });
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);

    expect(h.start).toHaveBeenCalledTimes(3); // profil + 1. reel + tavana takılan 2. reel; gerisi denenmedi
    expect(summary.notes.join(" ")).toMatch(/durduruldu/);
    const skipped = summary.targets.filter((t) => t.content?.skippedReason?.includes("bütçe tavanı"));
    expect(skipped).toHaveLength(2);
  });
});

describe("ölçüm koşusu seçenekleri ve döngü işleri", () => {
  const AFTER = { resolved: 1, suggested: 0, suggestionNotifications: 0, dueCount: 2, dueNotifications: 2, notes: [] };

  it("ownOnly hedef okumaya, newerThan reel girdisine, purpose koşu isteğine geçer", async () => {
    vi.mocked(loadTargets).mockResolvedValue({ targets: [TARGETS[0]], skipped: [], ownViaZernio: [] });
    const h = harness();
    await collectOnce({ workspaceId: WS, now: NOW, ownOnly: true, newerThan: "2026-09-20T00:00:00Z", purpose: "measurement", limit: 4, reconcileWaitMs: 0 }, h.deps);

    expect(vi.mocked(loadTargets).mock.calls[0][2]).toEqual({ ownOnly: true });
    const requests = h.start.mock.calls.map(([r]) => r);
    expect(requests.map((r) => r.purpose)).toEqual(["measurement", "measurement"]); // profil + reel
    expect(requests[1].input).toMatchObject({ onlyPostsNewerThan: "2026-09-20", resultsLimit: 4 });
  });

  it("amaç verilmezse koşu normal iştir (purpose yok)", async () => {
    const h = harness();
    await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    expect(h.start.mock.calls.every(([r]) => r.purpose === undefined)).toBe(true);
  });

  it("döngü işleri yalnız tamamlanan turda, skordan sonra, tek kez ve turun saatiyle çalışır", async () => {
    const h = harness();
    const afterCollect = vi.fn(async () => AFTER);
    h.deps.afterCollect = afterCollect;

    expect((await collectOnce({ workspaceId: WS, now: NOW, dryRun: true }, h.deps)).afterCollect).toBeUndefined();
    expect((await collectOnce({ workspaceId: WS, now: NOW, limit: 20 }, h.deps)).outcome).toBe("blocked");
    expect(afterCollect).not.toHaveBeenCalled();

    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    expect(afterCollect).toHaveBeenCalledTimes(1);
    expect(afterCollect).toHaveBeenCalledWith(h.deps.client, WS, NOW);
    expect(summary.afterCollect).toEqual(AFTER);
  });

  it("döngü işleri düşerse tur düşmez: sonuç tamamlandı, sebep nota yazılır", async () => {
    const h = harness();
    h.deps.afterCollect = async () => {
      throw new Error("bildirim tablosu yok");
    };
    const summary = await collectOnce({ workspaceId: WS, now: NOW, reconcileWaitMs: 0 }, h.deps);
    expect(summary.outcome).toBe("completed");
    expect(summary.afterCollect).toBeUndefined();
    expect(summary.notes.join(" ")).toMatch(/Döngü işleri yapılamadı: bildirim tablosu yok/);
  });
});
