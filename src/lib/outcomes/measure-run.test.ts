/**
 * Ölçüm harcama kuralı ve `measure:now` akışı. Apify/Supabase sahte; para harcanmaz, ağ yok.
 * Asıl kanıtlar: pencerede Reels yoksa Apify'a (tahmin dahil) hiç gidilmez; onay yoksa (tavan NULL / kalan hak yetmiyor / tahmin
 * `--max-usd`'yi aşıyor) gerçek koşu HİÇ başlatılmaz; `--dry-run` hiç harcamaz; harcama `purpose = measurement` ile yapılır.
 */
import { describe, expect, it, vi } from "vitest";

import type { CollectSummary } from "@/lib/collection/types";
import { parseMeasureArgs } from "@/lib/outcomes/measure-args";
import { decideMeasureBudget } from "@/lib/outcomes/measure-budget";
import { formatMeasureResult, measureOnce, type MeasureDeps } from "@/lib/outcomes/measure-run";
import type { AdminClient } from "@/lib/supabase/admin";

const WS = "7a3f0000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-12T09:00:00Z");

describe("decideMeasureBudget", () => {
  it("tavan onaysız (undefined) → harcama reddedilir; açık --max-usd tek seferlik onaydır", () => {
    const refused = decideMeasureBudget({ estimateUsd: 0.013, spentUsd: 0 });
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toMatch(/onaylı değil/);

    expect(decideMeasureBudget({ estimateUsd: 0.013, flagMaxUsd: 0.05, spentUsd: 0 })).toMatchObject({ allowed: true, basis: "flag", maxUsd: 0.05 });
  });

  it("tahmin --max-usd'yi aşarsa reddedilir (aylık tavan olsa bile açık bayrak belirleyici)", () => {
    expect(decideMeasureBudget({ estimateUsd: 0.029, flagMaxUsd: 0.02, monthlyCapUsd: 1, spentUsd: 0 }).allowed).toBe(false);
  });

  it("aylık tavan: kalan hak ≥ tahmin ise harcanır (tavan = kalan), değilse reddedilir; 0 = ölçüm kapalı", () => {
    expect(decideMeasureBudget({ estimateUsd: 0.029, monthlyCapUsd: 0.5, spentUsd: 0.2 })).toMatchObject({ allowed: true, basis: "monthly_cap", maxUsd: 0.3 });
    expect(decideMeasureBudget({ estimateUsd: 0.029, monthlyCapUsd: 0.5, spentUsd: 0.49 }).allowed).toBe(false);
    expect(decideMeasureBudget({ estimateUsd: 0.029, monthlyCapUsd: 0.5, spentUsd: 0.9 }).allowed).toBe(false); // aşılmış: kalan 0
    expect(decideMeasureBudget({ estimateUsd: 0.013, monthlyCapUsd: 0, spentUsd: 0 }).allowed).toBe(false);
    expect(decideMeasureBudget({ estimateUsd: 0.013, monthlyCapUsd: 0.013, spentUsd: 0 }).allowed).toBe(true); // tam sınır
  });
});

describe("parseMeasureArgs", () => {
  it("--dry-run ve --max-usd; bilinmeyen bayrak ve aralık dışı tutar hata", () => {
    expect(parseMeasureArgs([])).toEqual({ dryRun: false });
    expect(parseMeasureArgs(["--dry-run", "--max-usd=0.05"])).toEqual({ dryRun: true, maxUsd: 0.05 });
    for (const bad of [["--max-usd=0"], ["--max-usd=5"], ["--max-usd=abc"], ["--limit=3"], ["--dryrun"]]) expect(() => parseMeasureArgs(bad)).toThrow();
  });
});

function summary(over: Partial<CollectSummary> = {}): CollectSummary {
  return {
    outcome: "dry_run",
    plan: {
      jobs: [
        { label: "profil (1 hesap)", spec: { kind: "profile", actorId: "apify/instagram-profile-scraper", input: {}, expectedResults: 1 }, targets: [{ handle: "ornek", platform: "instagram" }] as never, estimatedUsd: 0.0026, priceUnknown: false },
        { label: "@ornek", spec: { kind: "content", actorId: "apify/instagram-reel-scraper", input: {}, expectedResults: 4 }, targets: [{ handle: "ornek", platform: "instagram" }] as never, estimatedUsd: 0.0104, priceUnknown: false },
      ],
      estimatedUsd: 0.013,
      maxUsd: 2,
      withinCeiling: true,
      priceUnknown: false,
    },
    targets: [],
    runs: [],
    cost: { reservedUsd: 0, pendingReconcile: 0 },
    notes: [],
    ...over,
  };
}

function harness(opts: { reels?: number; monthlyCapUsd?: number; spentUsd?: number } = {}) {
  const collect = vi.fn(async (options: { dryRun?: boolean; maxUsd?: number }): Promise<CollectSummary> =>
    options.dryRun ? summary() : summary({ outcome: "completed", cost: { reservedUsd: 0.013, actualUsd: 0.012, pendingReconcile: 0 } }),
  );
  const deps: MeasureDeps = {
    client: {} as AdminClient,
    collect: collect as unknown as MeasureDeps["collect"],
    countReels: async () => opts.reels ?? 4,
    budgetState: async () => ({ monthlyCapUsd: opts.monthlyCapUsd, spentUsd: opts.spentUsd ?? 0 }),
  };
  return { deps, collect };
}

describe("measureOnce", () => {
  it("pencerede Reels yok → Apify'a hiç gidilmez (tahmin dahil), harcama $0", async () => {
    const h = harness({ reels: 0 });
    const result = await measureOnce({ workspaceId: WS, now: NOW, dryRun: false, maxUsd: 0.05 }, h.deps);
    expect(result.outcome).toBe("no_reels");
    expect(h.collect).not.toHaveBeenCalled();
    expect(formatMeasureResult(result).join(" ")).toMatch(/Ölçülecek Reels yok.*harcama \$0/);
  });

  it("onay yok (tavan NULL, --max-usd yok) → yalnız tahmin okunur (dryRun: true); gerçek koşu HİÇ başlamaz", async () => {
    const h = harness();
    const result = await measureOnce({ workspaceId: WS, now: NOW, dryRun: false }, h.deps);
    expect(result.outcome).toBe("refused");
    expect(h.collect.mock.calls.map(([o]) => o.dryRun)).toEqual([true]);
    expect(formatMeasureResult(result).join("\n")).toMatch(/REDDEDİLDİ.*onaylı değil/);
  });

  it("kalan hak tahminden küçük → reddedilir, koşu başlamaz", async () => {
    const h = harness({ monthlyCapUsd: 0.5, spentUsd: 0.495 });
    expect((await measureOnce({ workspaceId: WS, now: NOW, dryRun: false }, h.deps)).outcome).toBe("refused");
    expect(h.collect.mock.calls.every(([o]) => o.dryRun === true)).toBe(true);
  });

  it("--dry-run onay geçse bile hiç harcamaz; planı ve kararı yazar", async () => {
    const h = harness({ monthlyCapUsd: 0.5 });
    const result = await measureOnce({ workspaceId: WS, now: NOW, dryRun: true }, h.deps);
    expect(result.outcome).toBe("dry_run");
    expect(result.accountCount, "ölçülecek ayrık hesap sayısı (kredi tahmini girdisi): iki koşu aynı hesabı kapsar").toBe(1);
    expect(h.collect.mock.calls.every(([o]) => o.dryRun === true)).toBe(true);
    const text = formatMeasureResult(result).join("\n");
    expect(text).toMatch(/profil \(1 hesap\)/);
    expect(text).toMatch(/Kuru koşu: hiçbir koşu başlatılmadı/);
  });

  it("onaylı → tek harcama çağrısı: yalnız kendi hesap, son 10 gün, limit = Reels sayısı, purpose = measurement, tavan = kalan hak", async () => {
    const h = harness({ reels: 4, monthlyCapUsd: 0.5, spentUsd: 0.2 });
    const result = await measureOnce({ workspaceId: WS, now: NOW, dryRun: false }, h.deps);
    expect(result.outcome).toBe("completed");
    const spending = h.collect.mock.calls.map(([o]) => o).filter((o) => o.dryRun === false);
    expect(spending).toHaveLength(1);
    expect(spending[0]).toMatchObject({ ownOnly: true, purpose: "measurement", limit: 4, maxUsd: 0.3, newerThan: "2026-10-02T09:00:00.000Z" });
  });

  it("açık --max-usd tek seferlik onaydır (aylık tavan olmasa da)", async () => {
    const h = harness();
    const result = await measureOnce({ workspaceId: WS, now: NOW, dryRun: false, maxUsd: 0.05 }, h.deps);
    expect(result.outcome).toBe("completed");
    expect(h.collect.mock.calls.filter(([o]) => o.dryRun === false).map(([o]) => o.maxUsd)).toEqual([0.05]);
  });
});
