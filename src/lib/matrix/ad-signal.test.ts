import { describe, expect, it } from "vitest";

import { emptyAdCellStat } from "@/lib/domain/ads";
import { adCellSignalOf } from "@/lib/matrix/ad-signal";

const stat = (over: Partial<ReturnType<typeof emptyAdCellStat>>) => ({ ...emptyAdCellStat(), ...over });

describe("adCellSignalOf", () => {
  it("öncelik: worked > fatigued > weak > unmeasured > untested", () => {
    expect(adCellSignalOf(stat({ creatives: 4, worked: 1, fatigued: 1, weak: 1 }))).toBe("worked");
    expect(adCellSignalOf(stat({ creatives: 3, fatigued: 1, weak: 2 }))).toBe("fatigued");
    expect(adCellSignalOf(stat({ creatives: 2, weak: 1 }))).toBe("weak");
    expect(adCellSignalOf(stat({ creatives: 2 }))).toBe("unmeasured");
    expect(adCellSignalOf(emptyAdCellStat())).toBe("untested");
  });

  it("eşik sınırı: 1 kreatif / 1 tutan yeter; 0 sayı işareti yükseltmez", () => {
    expect(adCellSignalOf({ creatives: 1, worked: 1, fatigued: 0, weak: 0 })).toBe("worked");
    expect(adCellSignalOf({ creatives: 1, worked: 0, fatigued: 0, weak: 0 })).toBe("unmeasured");
    expect(adCellSignalOf({ creatives: 0, worked: 0, fatigued: 0, weak: 0 })).toBe("untested");
  });

  it("tanımsız sayılar 0 gibi okunmaz ama çökmez (kreatif varsa unmeasured, yoksa untested)", () => {
    const loose = (o: object) => o as Parameters<typeof adCellSignalOf>[0];
    expect(adCellSignalOf(loose({ creatives: 2 }))).toBe("unmeasured");
    expect(adCellSignalOf(loose({}))).toBe("untested");
    expect(adCellSignalOf(loose({ creatives: undefined, worked: undefined }))).toBe("untested");
  });
});
