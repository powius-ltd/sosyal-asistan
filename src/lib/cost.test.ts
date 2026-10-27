import { describe, expect, it } from "vitest";

import { costView } from "@/lib/cost";
import type { CostBucket } from "@/lib/domain/run";

const bucket = (o: Partial<CostBucket> = {}): CostBucket => ({
  capUsd: 5,
  committedUsd: 0.14,
  actualUsd: 0.08,
  runs: 3,
  unreconciledRuns: 2,
  priceUnknownRuns: 0,
  ...o,
});

describe("costView", () => {
  it("harcanan (mutabık), rezerve (tavana sayılan − gerçek) ve yüzde", () => {
    const v = costView(bucket({ capUsd: 10, committedUsd: 2.5, actualUsd: 1, unreconciledRuns: 1 }));
    expect(v).toMatchObject({ capState: "set", capUsd: 10, spentUsd: 1, reservedUsd: 1.5, ratio: 0.25, level: "ok" });
  });

  it("hiçbir koşu mutabık değilse harcanan undefined (0 değil); hiç koşu yoksa gerçek 0", () => {
    expect(costView(bucket({ actualUsd: 0, unreconciledRuns: 3, runs: 3 })).spentUsd).toBeUndefined();
    expect(costView(bucket({ actualUsd: 0, unreconciledRuns: 0, runs: 0, committedUsd: 0 })).spentUsd).toBe(0);
    expect(costView(bucket({ actualUsd: 0, unreconciledRuns: 0, runs: 2 })).spentUsd).toBe(0);
  });

  it("tavan yok: none; tavan 0: closed (harcama kapalı, yüzde yok); pozitif: set", () => {
    expect(costView(bucket({ capUsd: undefined }))).toMatchObject({ capState: "none", capUsd: undefined, ratio: undefined, level: "ok" });
    expect(costView(bucket({ capUsd: 0 }))).toMatchObject({ capState: "closed", capUsd: 0, ratio: undefined, level: "ok" });
    expect(costView(bucket({ capUsd: 0.01 })).capState).toBe("set");
  });

  it("seviye: <0,8 ok · ≥0,8 warn · ≥1 over", () => {
    const level = (committedUsd: number) => costView(bucket({ capUsd: 10, committedUsd })).level;
    expect([level(7.9), level(8), level(9.99), level(10), level(25)]).toEqual(["ok", "warn", "warn", "over", "over"]);
  });

  it("rezerve negatif olmaz", () => {
    expect(costView(bucket({ committedUsd: 0.05, actualUsd: 0.08 })).reservedUsd).toBe(0);
  });
});
