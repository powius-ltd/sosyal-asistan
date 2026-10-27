import { describe, expect, it } from "vitest";

import type { AdCreativeOutcome } from "@/lib/domain/ads";
import { adCellKey, buildAdCellStats, type ContentCellInfo } from "@/lib/matrix/ad-cells";

const CELL = adCellKey("sorunu-biliyor", "aci-korku");
const OTHER = adCellKey("cozum-ariyor", "kimlik");

const ad = (adId: string, over: Partial<AdCreativeOutcome> = {}): AdCreativeOutcome => ({ adId, outcome: "worked", confidence: "high", ...over });
const inCell = (): ContentCellInfo => ({ stage: "sorunu-biliyor", angle: "aci-korku" });
const base = { sourceContentId: "c" };

describe("buildAdCellStats", () => {
  it("hücre çözümü: yalnız içeriğin etiketi; içeriksiz ya da etiketsiz içerikli kreatif hücreye yazılmaz", () => {
    const contentCell = (id: string): ContentCellInfo | undefined => (id === "c1" ? { stage: "cozum-ariyor", angle: "kimlik", hookType: "list" } : undefined);
    const { cells, unlabeled } = buildAdCellStats(
      { creatives: [ad("a1", { sourceContentId: "c1" }), ad("a2"), ad("a3", { sourceContentId: "etiketsiz" })], unlabeledAdCount: 0 },
      contentCell,
    );
    expect(cells.get(OTHER)?.samples.map((s) => s.adRef)).toEqual(["ad:a1"]);
    expect(cells.get(OTHER)?.samples[0]).toMatchObject({ hookType: "list", sourceContentId: "c1" });
    expect(cells.get(CELL)).toBeUndefined();
    expect(unlabeled).toBe(2);
    expect(cells.size).toBe(1);
  });

  it("sayım, güven, medyan, harcama; ölçülemeyen undefined", () => {
    const { cells } = buildAdCellStats(
      {
        creatives: [
          ad("a", { ...base, outcome: "worked", confidence: "high", spend: { amount: 100, currency: "TRY" }, costVsBaseline: 0.6 }),
          ad("b", { ...base, outcome: "fatigued", confidence: "medium", spend: { amount: 50, currency: "TRY" }, costVsBaseline: 1.0 }),
          ad("c", { ...base, outcome: "weak", confidence: "high", spend: { amount: 50, currency: "TRY" }, costVsBaseline: 1.6 }),
          ad("d", { ...base, outcome: "unjudged", confidence: "low" }),
        ],
        unlabeledAdCount: 0,
      },
      inCell,
    );
    const stat = cells.get(CELL);
    expect(stat).toMatchObject({ creatives: 4, judged: 3, worked: 1, fatigued: 1, weak: 1, confidence: "medium" });
    expect(stat?.spend).toEqual({ amount: 200, currency: "TRY" });
    expect(stat?.costVsBaseline).toBe(1);
    expect(stat?.returnVsBaseline).toBeUndefined();
    expect(stat?.samples.map((s) => s.adRef)).toEqual(["ad:a", "ad:b", "ad:c"]);
  });

  it("yargılanan 3'ten azsa güven düşük; para birimleri karışıksa harcama yok", () => {
    const { cells } = buildAdCellStats(
      {
        creatives: [ad("a", { ...base, spend: { amount: 10, currency: "TRY" } }), ad("b", { ...base, spend: { amount: 10, currency: "USD" } })],
        unlabeledAdCount: 0,
      },
      inCell,
    );
    expect(cells.get(CELL)?.confidence).toBe("low");
    expect(cells.get(CELL)?.spend).toBeUndefined();
  });

  it("örnekler: tutan, yorulan, tutmayan, yargılanmayan sırası, eşitlikte adRef; en çok 3", () => {
    const { cells } = buildAdCellStats(
      {
        creatives: [
          ad("z", { ...base, outcome: "unjudged" }),
          ad("y", { ...base, outcome: "weak" }),
          ad("x", { ...base, outcome: "worked" }),
          ad("w", { ...base, outcome: "worked" }),
        ],
        unlabeledAdCount: 0,
      },
      inCell,
    );
    expect(cells.get(CELL)?.samples.map((s) => s.adRef)).toEqual(["ad:w", "ad:x", "ad:y"]);
  });
});
