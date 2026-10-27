import { describe, expect, it } from "vitest";

import { AD_GROUP_KEYS, adGroupOf, groupAds } from "@/components/ads/ad-groups";
import { AD_VERDICT_STATUSES, type AdResult, type AdVerdictStatus } from "@/lib/domain/ads";

const ad = (id: string, status: AdVerdictStatus, spend: number): AdResult =>
  ({
    ad: { id, adSetId: "s", externalId: id, name: id, status: "active" },
    sums: { spend, impressions: 0, days: 1 },
    metrics: {},
    vsBaseline: {},
    verdict: { status, reasons: [], confidence: "low" },
  }) as AdResult;

describe("groupAds", () => {
  it("her karar bir gruba girer ve sıra: artır, azalt/kapat, yoruldu, bekle, erken, karar yok", () => {
    for (const status of AD_VERDICT_STATUSES) expect(AD_GROUP_KEYS).toContain(adGroupOf(status));
    const groups = groupAds([ad("u", "undecided", 1), ad("h", "hold", 1), ad("s", "scale", 1), ad("r", "reduce", 1), ad("x", "stop", 5), ad("l", "learning", 1), ad("f", "fatigued", 1)]);
    expect(groups.map((group) => group.key)).toEqual(["scale", "trim", "fatigued", "hold", "early", "undecided"]);
    expect(groups[1]?.ads.map((item) => item.ad.id)).toEqual(["x", "r"]);
  });

  it("boş grup çizilmez", () => {
    expect(groupAds([ad("a", "scale", 1)]).map((group) => group.key)).toEqual(["scale"]);
    expect(groupAds([])).toEqual([]);
  });
});
