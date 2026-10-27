import { describe, expect, it } from "vitest";

import { buildMockAds } from "@/lib/data/mock/generators/ads";
import type { AdDataset } from "@/lib/data/views/ads";
import { adCreativeOutcomeOf, buildAdMatrixSource, buildAdUsageFromReports } from "@/lib/matrix/ad-source";
import type { AdResult, AdVerdictStatus } from "@/lib/domain/ads";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const DAY = "2026-10-20";

const resultWith = (status: AdVerdictStatus, vs: AdResult["vsBaseline"] = {}): AdResult =>
  ({ verdict: { status, reasons: [], confidence: "high" }, vsBaseline: vs }) as unknown as AdResult;

describe("adCreativeOutcomeOf", () => {
  it("scale tuttu · fatigued yoruldu · reduce/stop tutmadı", () => {
    expect(adCreativeOutcomeOf(resultWith("scale"))).toBe("worked");
    expect(adCreativeOutcomeOf(resultWith("fatigued"))).toBe("fatigued");
    expect(adCreativeOutcomeOf(resultWith("reduce"))).toBe("weak");
    expect(adCreativeOutcomeOf(resultWith("stop"))).toBe("weak");
  });
  it("learning, insufficient_data ve undecided yargılanmamış sayılır", () => {
    for (const status of ["learning", "insufficient_data", "undecided"] as const) expect(adCreativeOutcomeOf(resultWith(status))).toBe("unjudged");
  });
  it("hold yalnız alışılmışından iyiyse tuttu", () => {
    expect(adCreativeOutcomeOf(resultWith("hold", { costPerResult: 0.6 }))).toBe("worked");
    expect(adCreativeOutcomeOf(resultWith("hold", {}))).toBe("unjudged");
  });
});

describe("buildAdMatrixSource / buildAdUsageFromReports", () => {
  const data = buildMockAds("w", DAY, "own-1");

  it("reklam hesabı yoksa undefined", () => {
    const empty: AdDataset = { ...data, accounts: [], campaigns: [], adSets: [], ads: [], creatives: [], metrics: [] };
    expect(buildAdMatrixSource(empty, NOW)).toBeUndefined();
  });
  it("içeriğe bağlı kreatif listeye girer, bağsız olanlar etiketsiz sayılır", () => {
    const source = buildAdMatrixSource(data, NOW);
    expect(source?.creatives.map((c) => c.sourceContentId)).toEqual(["own-1"]);
    expect(source?.unlabeledAdCount).toBe(5);
  });
  it("kullanım: bağlı içerik için satır, işaret karardan; bağsız içerik için satır yok", () => {
    const usage = buildAdUsageFromReports(data, ["own-1", "baska"], NOW);
    expect(usage.map((u) => u.contentItemId)).toEqual(["own-1"]);
    expect(usage[0]?.creativeCount).toBe(1);
    expect(usage[0]?.adRefs).toHaveLength(1);
  });
});
