import { describe, expect, it } from "vitest";

import {
  BASELINE_LOW_CONFIDENCE_CAP_SHARE,
  capConfidenceForBaseline,
  confidenceForSample,
  emptyPlanSections,
  isWeekStart,
  plannedPostCount,
  weekDayKeys,
  weekStartOf,
} from "@/lib/domain/weekly-plan";

describe("confidenceForSample", () => {
  it("≥ 10 yüksek, ≥ 5 orta, aksi düşük", () => {
    expect([0, 4, 5, 9, 10, 40].map(confidenceForSample)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });

  it("bilinmeyen/geçersiz örnek sayısı düşük güvendir", () => {
    expect([undefined, Number.NaN, Number.POSITIVE_INFINITY].map(confidenceForSample)).toEqual(["low", "low", "low"]);
  });
});

describe("capConfidenceForBaseline", () => {
  it("eşik %50: düşük güvenli baz çizgisi payı ≥ 0,5 ise yüksek → orta; altında aynen kalır", () => {
    expect(BASELINE_LOW_CONFIDENCE_CAP_SHARE).toBe(0.5);
    expect([0, 0.25, 0.49].map((share) => capConfidenceForBaseline("high", share))).toEqual(["high", "high", "high"]);
    expect([0.5, 0.75, 1].map((share) => capConfidenceForBaseline("high", share))).toEqual(["medium", "medium", "medium"]);
  });

  it("tavan yalnız düşürür: orta ve düşük hiçbir payda değişmez, yükseltme yok", () => {
    for (const share of [0, 0.5, 1]) {
      expect(capConfidenceForBaseline("medium", share)).toBe("medium");
      expect(capConfidenceForBaseline("low", share)).toBe("low");
    }
  });

  it("pay ölçülemediyse (undefined/NaN) güven aynen kalır: bilinmeyen pay tavan için kanıt değildir", () => {
    expect([undefined, Number.NaN].map((share) => capConfidenceForBaseline("high", share))).toEqual(["high", "high"]);
    expect(capConfidenceForBaseline("low", undefined)).toBe("low");
  });

  it("örnek sayısı güveniyle birleşir: 12 örnek + düşük baz çizgisi = orta, 12 örnek + sağlam baz çizgisi = yüksek", () => {
    expect(capConfidenceForBaseline(confidenceForSample(12), 0.8)).toBe("medium");
    expect(capConfidenceForBaseline(confidenceForSample(12), 0.1)).toBe("high");
    expect(capConfidenceForBaseline(confidenceForSample(3), 1)).toBe("low");
  });
});

describe("plannedPostCount", () => {
  it("rakip medyan haftalık sıklığın yarısı, 3–5 arasına kırpılır", () => {
    expect([2, 6, 8, 9, 10, 30].map(plannedPostCount)).toEqual([3, 3, 4, 5, 5, 5]);
  });

  it("rakip sıklığı ölçülemezse alt sınır (0 değil)", () => {
    expect(plannedPostCount(undefined)).toBe(3);
    expect(plannedPostCount(Number.NaN)).toBe(3);
  });
});

describe("hafta günleri", () => {
  it("weekStartOf: haftanın Pazartesi'si (2026-10-05 Pazartesi)", () => {
    expect(["2026-10-05", "2026-10-07", "2026-10-11", "2026-10-12"].map(weekStartOf)).toEqual([
      "2026-10-05",
      "2026-10-05",
      "2026-10-05",
      "2026-10-12",
    ]);
  });

  it("ay ve yıl sınırlarını geçer", () => {
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });

  it("geçersiz gün → undefined (2026-02-31 sessizce kaymaz)", () => {
    expect(["2026-02-31", "2026-13-01", "bugün", ""].map(weekStartOf)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("isWeekStart yalnız Pazartesi için true", () => {
    expect(isWeekStart("2026-10-05")).toBe(true);
    expect(isWeekStart("2026-10-06")).toBe(false);
    expect(isWeekStart("2026-02-31")).toBe(false);
  });

  it("weekDayKeys: Pzt → Paz 7 gün; Pazartesi olmayan günden de haftaya hizalanır", () => {
    expect(weekDayKeys("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(weekDayKeys("2026-10-08")[0]).toBe("2026-10-05");
    expect(weekDayKeys("kötü")).toEqual([]);
  });
});

describe("emptyPlanSections", () => {
  it("beş bölüm de var; geçen hafta 'yayın verisi bekleniyor'", () => {
    const sections = emptyPlanSections();
    expect(Object.keys(sections).sort()).toEqual(["avoid", "focus", "review", "schedule", "winners"]);
    expect(sections.review.status).toBe("awaiting_publish_data");
    expect(sections.winners.rivals).toEqual([]);
  });

  it("her çağrı bağımsız nesne döndürür", () => {
    const a = emptyPlanSections();
    a.winners.rivals.push({ contentItemId: "x", ownerHandle: "h", isOwn: false, lift: 3, analyzed: false });
    expect(emptyPlanSections().winners.rivals).toEqual([]);
  });
});
