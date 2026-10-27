import { describe, expect, it } from "vitest";

import { countNewContent, referenceCollectionUsd } from "@/lib/orchestrator/state-derive";

type Run = Parameters<typeof referenceCollectionUsd>[0][number];
const run = (over: Partial<Run>): Run => ({ provider: "apify", status: "ingested", purpose: undefined, startedAt: "2026-09-30T19:00:00.000Z", reservedUsd: 0.05, actualUsd: undefined, ...over });

describe("referenceCollectionUsd", () => {
  it("koşu yoksa undefined (0 değil)", () => {
    expect(referenceCollectionUsd([])).toBeUndefined();
  });

  it("son oturumun toplamı: gerçek tutar varsa o, yoksa rezerve; eski oturum ve ölçüm koşusu girmez", () => {
    const runs = [
      run({ startedAt: "2026-09-30T19:00:00.000Z", actualUsd: 0.02 }),
      run({ startedAt: "2026-09-30T19:05:00.000Z", reservedUsd: 0.25 }),
      run({ startedAt: "2026-09-30T19:20:00.000Z", actualUsd: 0.1 }),
      run({ startedAt: "2026-09-20T10:00:00.000Z", actualUsd: 9 }),
      run({ startedAt: "2026-09-30T19:10:00.000Z", actualUsd: 5, purpose: "measurement" }),
      run({ startedAt: "2026-09-30T19:10:00.000Z", actualUsd: 7, provider: "claude_cli" }),
    ];
    expect(referenceCollectionUsd(runs)).toBeCloseTo(0.37, 6);
  });
});

describe("countNewContent", () => {
  const items = [{ firstSeenAt: "2026-09-30T10:00:00.000Z" }, { firstSeenAt: "2026-09-30T20:00:00.000Z" }];
  it("brifing yoksa tüm içerik; varsa ondan sonra görülenler", () => {
    expect(countNewContent(items, undefined)).toBe(2);
    expect(countNewContent(items, "2026-09-30T15:00:00.000Z")).toBe(1);
    expect(countNewContent(items, "2026-10-01T00:00:00.000Z")).toBe(0);
  });
  it("okunamayan zaman yeni sayılmaz", () => {
    expect(countNewContent(items, "bozuk")).toBe(0);
  });
});
