import { describe, expect, it } from "vitest";

import { adCellStateOf, adOutcomeOf, buildLearningMarks, type OrganicFact } from "@/lib/ads/learning";
import { emptyCreativeCell, type CreativeMatrixCell } from "@/lib/domain/creative-matrix";
import type { Ad, AdResult, AdVerdict, AdVerdictStatus } from "@/lib/domain/ads";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

const organic = (over: Partial<OrganicFact> = {}, score: Partial<OrganicFact["score"]> = {}): OrganicFact => ({
  contentId: "c1", ageDays: 10, inNiche: true, analysisVerified: true, linkedToAd: false,
  score: { lift: 2.5, lowConfidence: false, immature: false, ...score }, ...over,
});
const verdict = (status: AdVerdictStatus, confidence: ConfidenceLevel = "high"): AdVerdict => ({ status, reasons: ["x"], confidence });
const result = (id: string, status: AdVerdictStatus, confidence: ConfidenceLevel = "high", vs: AdResult["vsBaseline"] = {}): AdResult => ({
  ad: { id, adSetId: "s", externalId: id, name: id, status: "active" } as Ad,
  sums: { spend: 1, impressions: 1, days: 1 }, metrics: {}, vsBaseline: vs, verdict: verdict(status, confidence),
});
const cell = (over: Partial<CreativeMatrixCell> = {}): CreativeMatrixCell => ({ ...emptyCreativeCell("kimlik", "sorunu-biliyor"), ...over });
const state = (signal: "worked" | "untested" | "fatigued", confidence: ConfidenceLevel = "high") => ({ signal, judged: 3, confidence });
const stat = (over: Partial<CreativeMatrixCell["rivals"]>) => ({ ...emptyCreativeCell("kimlik", "sorunu-biliyor").rivals, ...over });

describe("tuttu / tutmadı eşlemesi", () => {
  it("scale ve alışılmışından iyi hold tuttu; reduce / stop tutmadı; gerisi yargılanmamış", () => {
    expect(adOutcomeOf(verdict("scale"), {})).toBe("worked");
    expect(adOutcomeOf(verdict("hold"), { returnOnSpend: 1.2 })).toBe("worked");
    expect(adOutcomeOf(verdict("hold"), { returnOnSpend: 0.9 })).toBeUndefined();
    expect(adOutcomeOf(verdict("hold"), {})).toBeUndefined();
    expect(adOutcomeOf(verdict("fatigued"), {})).toBe("fatigued");
    expect(adOutcomeOf(verdict("stop"), {})).toBe("weak");
    for (const status of ["learning", "insufficient_data", "undecided"] as const) expect(adOutcomeOf(verdict(status), {})).toBeUndefined();
  });
  it("hücre işareti önceliği worked > fatigued > weak; yargılanan yoksa unmeasured; reklam yoksa untested", () => {
    expect(adCellStateOf([result("a", "stop"), result("b", "fatigued"), result("c", "scale")]).signal).toBe("worked");
    expect(adCellStateOf([result("a", "stop"), result("b", "fatigued")]).signal).toBe("fatigued");
    expect(adCellStateOf([result("a", "learning")])).toMatchObject({ signal: "unmeasured", judged: 0, confidence: "low" });
    expect(adCellStateOf([]).signal).toBe("untested");
  });
  it("az yargılanmış kreatif → düşük güven", () => {
    expect(adCellStateOf([result("a", "scale")]).confidence).toBe("low");
    expect(adCellStateOf([result("a", "scale"), result("b", "scale"), result("c", "scale")]).confidence).toBe("high");
  });
});

describe("buildLearningMarks — dört yön", () => {
  it("1 organik → reklam adayı (şartlar tamsa); bağlı / düşük güven / eski / niş dışı aday değil", () => {
    expect(buildLearningMarks({ organic: [organic()], cells: [], ads: [] })).toEqual([{ kind: "ad_candidate", subject: { contentId: "c1" }, weak: false, reasons: ["organic_won_not_in_ads"] }]);
    for (const bad of [organic({ linkedToAd: true }), organic({ ageDays: 61 }), organic({ inNiche: false }), organic({ analysisVerified: false }), organic({}, { lift: 1.9 }), organic({}, { lowConfidence: true }), organic({}, { lift: undefined })]) {
      expect(buildLearningMarks({ organic: [bad], cells: [], ads: [] })).toEqual([]);
    }
  });
  it("2 kanıtlı rakip hücresi + reklam denenmemiş → reklamda dene; reklam varsa yok", () => {
    const proven = cell({ status: "proven_opportunity", rivals: stat({ n: 4, medianLift: 2, confidence: "medium" }) });
    const marks = buildLearningMarks({ organic: [], cells: [{ cell: proven, ad: state("untested") }], ads: [] });
    expect(marks).toMatchObject([{ kind: "try_in_ads", weak: false }]);
    expect(buildLearningMarks({ organic: [], cells: [{ cell: proven, ad: state("worked") }], ads: [] }).some((m) => m.kind === "try_in_ads")).toBe(false);
  });
  it("3 reklamda tutan + organik denenmemiş → organikte dene; organik denenmişse yok", () => {
    const untried = buildLearningMarks({ organic: [], cells: [{ cell: cell(), ad: state("worked") }], ads: [] });
    expect(untried).toMatchObject([{ kind: "try_organic", weak: false }]);
    const tried = cell({ own: stat({ n: 2 }) });
    expect(buildLearningMarks({ organic: [], cells: [{ cell: tried, ad: state("worked") }], ads: [] })).toEqual([]);
  });
  it("4 yorulan reklam → aynı hücrede yeni açılış", () => {
    expect(buildLearningMarks({ organic: [], cells: [], ads: [result("a1", "fatigued"), result("a2", "scale")] })).toMatchObject([{ kind: "refresh_opening", subject: { adId: "a1" }, weak: false }]);
  });
});

describe("düşük güven", () => {
  it("düşük güvenli işaret weak: true ve güçlülerden sonra gelir", () => {
    const lowProven = cell({ status: "proven_opportunity", rivals: stat({ n: 1, medianLift: 2, confidence: "low" }), samples: [{ contentItemId: "r1", ownerHandle: "r", platform: "instagram", format: "short_video", currentLift: 4, isOwn: false }] });
    const marks = buildLearningMarks({ organic: [organic()], cells: [{ cell: lowProven, ad: state("untested") }], ads: [result("a1", "fatigued", "low")] });
    expect(marks.map((m) => [m.kind, m.weak])).toEqual([["ad_candidate", false], ["try_in_ads", true], ["refresh_opening", true]]);
  });
});
