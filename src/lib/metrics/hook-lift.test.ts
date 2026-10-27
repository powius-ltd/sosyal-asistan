import { describe, expect, it } from "vitest";

import { hookLiftByOwner, hookLiftTable, isOutlierLift, summarizeLiftSamples, summarizeLifts, type HookLiftSample, type LiftSample } from "@/lib/metrics/hook-lift";

const sample = (over: Partial<HookLiftSample> = {}): HookLiftSample => ({ hookType: "question", format: "short_video", owner: "competitor", lift: 1, ...over });

describe("isOutlierLift · ≥3x sınırı", () => {
  it("3x tutan, 2,99x değil; ölçülemeyen lift tutan sayılmaz", () => {
    expect([3, 2.999, 5, undefined, Number.NaN].map(isOutlierLift)).toEqual([true, false, true, false, false]);
  });
});

describe("summarizeLifts", () => {
  it("undefined ve geçersiz lift n'e girmez; medyan yalnız ölçülenlerden", () => {
    const summary = summarizeLifts([0.5, undefined, 3, Number.NaN, -1, 1]);
    expect(summary).toMatchObject({ n: 3, outlierCount: 1, confidence: "low" });
    expect(summary.medianLift).toBe(1);
  });

  it("hiç ölçülemediyse medyan undefined (0 değil), tutan 0, güven düşük", () => {
    expect(summarizeLifts([undefined, undefined])).toEqual({ n: 0, medianLift: undefined, outlierCount: 0, confidence: "low" });
    expect(summarizeLifts([])).toEqual({ n: 0, medianLift: undefined, outlierCount: 0, confidence: "low" });
  });

  it("gerçek sıfır lift ölçülmüştür: n'e girer, medyan 0 olur", () => {
    const summary = summarizeLifts([0]);
    expect(summary.n).toBe(1);
    expect(summary.medianLift).toBe(0);
  });

  it("güven eşikleri n'den: 4 düşük, 5 orta, 9 orta, 10 yüksek", () => {
    const confidenceOf = (n: number) => summarizeLifts(Array.from({ length: n }, () => 1)).confidence;
    expect([4, 5, 9, 10].map(confidenceOf)).toEqual(["low", "medium", "medium", "high"]);
  });
});

describe("summarizeLiftSamples · baz çizgisi güven tavanı", () => {
  const samples = (n: number, lowCount: number): LiftSample[] => Array.from({ length: n }, (_, i) => ({ lift: 1 + i / 10, lowBaseline: i < lowCount }));

  it("10 ölçülmüş örnek normalde yüksek; ≥ %50'si düşük güvenli baz çizgisindeyse orta (payı gösterir)", () => {
    expect(summarizeLiftSamples(samples(10, 4))).toMatchObject({ n: 10, confidence: "high", lowBaselineShare: 0.4 });
    expect(summarizeLiftSamples(samples(10, 5))).toMatchObject({ n: 10, confidence: "medium", lowBaselineShare: 0.5 });
    expect(summarizeLiftSamples(samples(10, 10))).toMatchObject({ confidence: "medium", lowBaselineShare: 1 });
  });

  it("tavan orta/düşük güveni değiştirmez", () => {
    expect(summarizeLiftSamples(samples(6, 6)).confidence).toBe("medium");
    expect(summarizeLiftSamples(samples(3, 3)).confidence).toBe("low");
  });

  it("pay yalnız ÖLÇÜLMÜŞ örneklerden: ölçülemeyen (lift yok) düşük güvenli örnekler paya girmez", () => {
    const mixed: LiftSample[] = [...samples(10, 0), ...Array.from({ length: 30 }, () => ({ lift: undefined, lowBaseline: true }))];
    expect(summarizeLiftSamples(mixed)).toMatchObject({ n: 10, confidence: "high", lowBaselineShare: 0 });
  });

  it("baz çizgisi bilgisi yoksa (lowBaseline undefined) tavan uygulanmaz ve pay undefined (0 değil)", () => {
    const unknown: LiftSample[] = Array.from({ length: 10 }, () => ({ lift: 2 }));
    const summary = summarizeLiftSamples(unknown);
    expect(summary).toMatchObject({ n: 10, confidence: "high" });
    expect(summary.lowBaselineShare).toBeUndefined();
    expect(summarizeLifts(unknown.map((s) => s.lift)).lowBaselineShare).toBeUndefined();
    expect(summarizeLiftSamples([]).lowBaselineShare).toBeUndefined();
  });

  it("hookLiftTable: lowBaseline örneği tavanı uygular; olgunlaşmamış içerik paya girmez", () => {
    const rows = hookLiftTable([
      ...Array.from({ length: 10 }, (_, i) => sample({ hookType: "question", lift: 2 + i / 10, lowBaseline: true })),
      sample({ hookType: "question", lift: 9, immature: true, lowBaseline: false }),
      ...Array.from({ length: 10 }, (_, i) => sample({ hookType: "list", lift: 1 + i / 10, lowBaseline: false })),
    ]);
    expect(rows.find((r) => r.hookType === "question")).toMatchObject({ n: 10, total: 11, confidence: "medium", lowBaselineShare: 1 });
    expect(rows.find((r) => r.hookType === "list")).toMatchObject({ n: 10, confidence: "high", lowBaselineShare: 0 });
  });
});

describe("hookLiftTable", () => {
  it("hook türü × format grupları; medyan lift, n, tutan sayısı ve güven", () => {
    const rows = hookLiftTable([
      sample({ hookType: "question", lift: 4 }),
      sample({ hookType: "question", lift: 1 }),
      sample({ hookType: "question", lift: 0.5 }),
      sample({ hookType: "bold_claim", lift: 0.4 }),
      sample({ hookType: "question", format: "carousel", lift: 2 }),
    ]);
    expect(rows.map((r) => [r.hookType, r.format, r.n, r.medianLift, r.outlierCount])).toEqual([
      ["question", "carousel", 1, 2, 0],
      ["question", "short_video", 3, 1, 1],
      ["bold_claim", "short_video", 1, 0.4, 0],
    ]);
    expect(rows[1]).toMatchObject({ total: 3, unmeasured: 0, confidence: "low" });
  });

  it("analizi olmayan içerik (hook türü yok) tabloya girmez", () => {
    expect(hookLiftTable([sample({ hookType: undefined }), sample({ hookType: "" })])).toEqual([]);
  });

  it("lift'i olmayan ve olgunlaşmamış içerik n'e girmez; yalnız unmeasured'a sayılır", () => {
    const [row] = hookLiftTable([sample({ lift: 2 }), sample({ lift: undefined }), sample({ lift: 9, immature: true })]);
    expect(row).toMatchObject({ n: 1, total: 3, unmeasured: 2, medianLift: 2, outlierCount: 0 });
  });

  it("grubun tamamı ölçülemediyse satır kalır ama medyan undefined (0 değil) ve sonda sıralanır", () => {
    const rows = hookLiftTable([sample({ hookType: "list", lift: undefined }), sample({ hookType: "pov", lift: 0.2 })]);
    expect(rows.map((r) => r.hookType)).toEqual(["pov", "list"]);
    expect(rows[1]).toMatchObject({ n: 0, medianLift: undefined, unmeasured: 1 });
  });

  it("sahip süzgeci: yalnız kendi ya da yalnız rakip; süzgeçsiz hepsi karışık", () => {
    const samples = [sample({ owner: "own", lift: 1 }), sample({ owner: "competitor", lift: 3 }), sample({ owner: "competitor", lift: 5 })];
    expect(hookLiftTable(samples, { owner: "own" })[0]).toMatchObject({ n: 1, medianLift: 1 });
    expect(hookLiftTable(samples, { owner: "competitor" })[0]).toMatchObject({ n: 2, medianLift: 4 });
    expect(hookLiftTable(samples)[0]).toMatchObject({ n: 3, medianLift: 3 });
  });

  it("hookLiftByOwner kendi ve rakibi ayırır; boş girdi boş tablo", () => {
    const { own, competitors } = hookLiftByOwner([sample({ owner: "own" }), sample({ owner: "competitor", hookType: "list" })]);
    expect([own.map((r) => r.hookType), competitors.map((r) => r.hookType)]).toEqual([["question"], ["list"]]);
    expect(hookLiftByOwner([])).toEqual({ own: [], competitors: [] });
  });

  it("sıralama deterministik: medyan azalan, eşitlikte n azalan, sonra ad", () => {
    const rows = hookLiftTable([
      sample({ hookType: "b", lift: 2 }),
      sample({ hookType: "a", lift: 2 }),
      sample({ hookType: "c", lift: 2 }),
      sample({ hookType: "c", lift: 2 }),
    ]);
    expect(rows.map((r) => r.hookType)).toEqual(["c", "a", "b"]);
  });
});
