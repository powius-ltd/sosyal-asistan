import { describe, expectTypeOf, it } from "vitest";

import type { ContentScore } from "@/lib/domain/content";
import type { NormalizedContent } from "@/lib/platforms/types";
import type { ItemScore, MetricItem, ScorableItem } from "@/lib/metrics/types";

describe("metrik tipleri — sözleşme uyumu", () => {
  it("ItemScore, content_items skor önbelleğiyle (ContentScore) birebir aynı", () => {
    expectTypeOf<ItemScore>().toEqualTypeOf<ContentScore>();
  });

  it("MetricItem bir ScorableItem'dır", () => {
    expectTypeOf<MetricItem>().toMatchTypeOf<ScorableItem>();
  });

  it("alan türleri normalize içerikle aynı", () => {
    expectTypeOf<ScorableItem["format"]>().toEqualTypeOf<NormalizedContent["format"]>();
    expectTypeOf<ScorableItem["isPinned"]>().toEqualTypeOf<NormalizedContent["isPinned"]>();
    expectTypeOf<ScorableItem["viewsKind"]>().toEqualTypeOf<NormalizedContent["metrics"]["viewsKind"]>();
  });
});
