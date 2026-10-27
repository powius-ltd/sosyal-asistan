import { describe, expect, it } from "vitest";

import { pickDirections } from "@/lib/insights/focus";
import type { ScoredGroup } from "@/lib/insights/groups";

function group(partial: Partial<ScoredGroup> & Pick<ScoredGroup, "group" | "value" | "confidence" | "score">): ScoredGroup {
  return {
    label: partial.value,
    items: [],
    liftN: 5,
    impact: 2,
    outlierCount: 0,
    ownTried: false,
    novelty: 1.5,
    comparable: true,
    ...partial,
  } as ScoredGroup;
}

describe("pickDirections", () => {
  it("düşük güvenli yön, puanı daha yüksek olsa da orta/yüksek güvenlilerin önüne geçemez", () => {
    // Gerçek veri: "Öğreti alıntısı" n=2 (düşük güven) puan 2,69; "90 sn ve üstü" yüksek güven puan 1,61.
    const low = group({ group: "hook_type", value: "teaching_quote", confidence: "low", score: 2.69, liftN: 2 });
    const high = group({ group: "duration_bucket", value: "90_plus", confidence: "high", score: 1.61, liftN: 24 });
    const medium = group({ group: "topic_cluster", value: "vision", confidence: "medium", score: 1.2, liftN: 5 });
    const picked = pickDirections([low, high, medium]);
    expect(picked.map((g) => g.value)).toEqual(["90_plus", "vision", "teaching_quote"]);
  });

  it("aynı güven sınıfında sıra puana göre kalır", () => {
    const a = group({ group: "duration_bucket", value: "a", confidence: "medium", score: 3 });
    const b = group({ group: "topic_cluster", value: "b", confidence: "high", score: 2 });
    expect(pickDirections([a, b]).map((g) => g.value)).toEqual(["a", "b"]);
  });
});
