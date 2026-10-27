import { describe, expect, it, vi } from "vitest";
import { buildPlan, DEFAULT_MAX_USD, MAX_CONTENT_LIMIT } from "@/lib/collection/plan";
import type { CollectTarget } from "@/lib/collection/types";

const TARGETS: CollectTarget[] = [
  { owner: { kind: "own", id: "o1" }, handle: "ornekhesap", platform: "instagram" },
  { owner: { kind: "competitor", id: "c1" }, handle: "ornekrakipbir", platform: "instagram" },
  { owner: { kind: "competitor", id: "c2" }, handle: "ornekrakipiki", platform: "instagram" },
  { owner: { kind: "competitor", id: "c3" }, handle: "ornekrakipuc", platform: "instagram" },
];

/** Sonuç başına sabit birim fiyat veren tahminci (Apify'a gitmez). */
const perResult = (unit: number) =>
  vi.fn(async (_actorId: string, expectedResults: number) => ({
    amountUsd: Math.round(unit * expectedResults * 1e6) / 1e6,
    unitPriceUsd: unit,
    priceUnknown: false,
  }));

describe("buildPlan", () => {
  it("1 profil koşusu (tüm hedefler) + hedef başına 1 reel koşusu; transcript kapalı, limit uygulanır", async () => {
    const plan = await buildPlan(TARGETS, { limit: 10, maxUsd: DEFAULT_MAX_USD }, perResult(0.0025));
    expect(plan.jobs).toHaveLength(5);

    const [profile, ...content] = plan.jobs;
    expect(profile.spec.kind).toBe("profile");
    expect(profile.targets).toHaveLength(4);
    expect(profile.spec.expectedResults).toBe(4);
    expect(profile.spec.input.usernames).toEqual(TARGETS.map((t) => t.handle));

    expect(content.map((job) => job.label)).toEqual(TARGETS.map((t) => `@${t.handle}`));
    for (const job of content) {
      expect(job.spec.kind).toBe("content");
      expect(job.targets).toHaveLength(1);
      expect(job.spec.expectedResults).toBe(10);
      expect(job.spec.input).toMatchObject({ resultsLimit: 10, includeTranscript: false });
    }
  });

  it("tahmin = koşu tahminlerinin toplamı; tavan içindeyse withinCeiling", async () => {
    const plan = await buildPlan(TARGETS, { limit: 10, maxUsd: 0.2 }, perResult(0.0025));
    // (4 profil + 40 reel) × 0,0025
    expect(plan.estimatedUsd).toBeCloseTo(0.11, 6);
    expect(plan.withinCeiling).toBe(true);
    expect(plan.priceUnknown).toBe(false);
  });

  it("toplam tavanı aşarsa withinCeiling false", async () => {
    const plan = await buildPlan(TARGETS, { limit: 10, maxUsd: 0.2 }, perResult(0.005));
    expect(plan.estimatedUsd).toBeCloseTo(0.22, 6);
    expect(plan.withinCeiling).toBe(false);
  });

  it("tam tavana eşit tahmin geçer (yuvarlama artığı yüzünden reddedilmez)", async () => {
    const plan = await buildPlan(TARGETS.slice(0, 1), { limit: 1, maxUsd: 0.2 }, perResult(0.1));
    expect(plan.estimatedUsd).toBeCloseTo(0.2, 6);
    expect(plan.withinCeiling).toBe(true);
  });

  it("fiyat okunamayan aktör işaretlenir", async () => {
    const estimate = vi.fn(async () => ({ amountUsd: 0.005, priceUnknown: true }));
    const plan = await buildPlan(TARGETS.slice(0, 1), { limit: 1, maxUsd: 1 }, estimate);
    expect(plan.priceUnknown).toBe(true);
  });

  it("geçersiz limit / tavan reddedilir", async () => {
    const estimate = perResult(0.001);
    await expect(buildPlan(TARGETS, { limit: 0, maxUsd: 1 }, estimate)).rejects.toThrow(RangeError);
    await expect(buildPlan(TARGETS, { limit: MAX_CONTENT_LIMIT + 1, maxUsd: 1 }, estimate)).rejects.toThrow(RangeError);
    await expect(buildPlan(TARGETS, { limit: 10, maxUsd: -1 }, estimate)).rejects.toThrow(RangeError);
    expect(estimate).not.toHaveBeenCalled();
  });
});
