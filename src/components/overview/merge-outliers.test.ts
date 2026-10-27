import { describe, expect, it } from "vitest";

import { testItem } from "@/components/content/test-item";
import { mergeOutliers } from "@/components/overview/merge-outliers";

const own = (id: string, lift?: number) =>
  testItem({ id, score: { lift, lowConfidence: false, immature: false } });
const rival = (id: string, lift?: number) =>
  testItem({
    id,
    owner: { kind: "competitor", id: "cp_1", handle: "rakip" },
    score: { lift, lowConfidence: false, immature: false },
  });

describe("mergeOutliers", () => {
  it("kendi ve rakip içeriklerini lift'e göre azalan sıralar", () => {
    const merged = mergeOutliers([rival("r1", 3.2), rival("r2", 5.1)], [own("o1", 4)], 10);
    expect(merged.map((item) => item.id)).toEqual(["r2", "o1", "r1"]);
  });

  it("lift'i ölçülemeyeni sona koyar ve aynı kimliği tekilleştirir", () => {
    const merged = mergeOutliers([rival("r1", undefined), rival("r2", 3)], [own("r2", 3)], 10);
    expect(merged.map((item) => item.id)).toEqual(["r2", "r1"]);
  });

  it("limiti uygular", () => {
    const merged = mergeOutliers([rival("a", 3), rival("b", 4), rival("c", 5)], [], 2);
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
  });
});
