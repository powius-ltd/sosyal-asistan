import { describe, expect, it } from "vitest";

import { ctaPositionBucket, firstSectionBucket, hookLengthBucket, tempoBucket } from "@/lib/anatomy/buckets";
import { derivePhases } from "@/lib/anatomy/phases";
import type { AnalysisSection } from "@/lib/domain/intel";

const s = (type: string, startSec?: number): AnalysisSection => ({ type, quote: `${type} alıntısı`, startSec });

/** Gerçek analiz (`2751b062…`): hook 0, problem 16, proof 21, problem 34, insight 40, cta 45, insight 59, practice 79. */
const REAL = [s("hook", 0), s("problem", 16), s("proof", 21), s("problem", 34), s("insight", 40), s("cta", 45), s("insight", 59), s("practice", 79)];

const brief = (spans: ReturnType<typeof derivePhases>) => spans.map((p) => [p.phase, p.startSec, p.endSec, p.durationSec]);

describe("derivePhases · faz kuralı", () => {
  it("gerçek örnek: Hook 0–16 · Giriş 16–21 · Gövde 21–45 · CTA 45–59 · Gövde 59–son", () => {
    const spans = derivePhases(REAL, 92);
    expect(brief(spans)).toEqual([
      ["hook", 0, 16, 16],
      ["intro", 16, 21, 5],
      ["body", 21, 45, 24],
      ["cta", 45, 59, 14],
      ["body", 59, 92, 33],
    ]);
    // Gövde içindeki ikinci "problem" gövdede kalır (giriş yalnız ilk gövde bölümünden ÖNCEKİ story/problem'dir).
    expect(spans[2].sections.map((q) => q.type)).toEqual(["proof", "problem", "insight"]);
    expect(spans[4].sections.map((q) => q.type)).toEqual(["insight", "practice"]);
  });

  it("süre yoksa yalnız SON parçanın bitişi/süresi ölçülemez (0 değil)", () => {
    const spans = derivePhases(REAL);
    expect(spans.at(-1)).toMatchObject({ phase: "body", startSec: 59, endSec: undefined, durationSec: undefined });
    expect(spans[0].durationSec).toBe(16);
  });

  it("CTA en sonda: CTA'dan sonra gövde parçası yok", () => {
    const spans = derivePhases([s("hook", 0), s("insight", 10), s("cta", 50)], 60);
    expect(spans.map((p) => p.phase)).toEqual(["hook", "body", "cta"]);
    expect(brief(spans)[2]).toEqual(["cta", 50, 60, 10]);
  });

  it("startSec eksik: o parçanın süresi undefined; sonraki parça etkilenmez", () => {
    const spans = derivePhases([s("hook", 0), s("problem"), s("insight", 12), s("cta", 30)], 40);
    // hook bitişi = sonraki bölümün (problem) startSec'i yok → ölçülemez; intro başlangıcı yok.
    expect(brief(spans)).toEqual([
      ["hook", 0, undefined, undefined],
      ["intro", undefined, 12, undefined],
      ["body", 12, 30, 18],
      ["cta", 30, 40, 10],
    ]);
  });

  it("hiç zaman yoksa tüm süreler undefined, fazlar yine ayrışır", () => {
    const spans = derivePhases([s("hook"), s("story"), s("proof"), s("cta")]);
    expect(spans.map((p) => p.phase)).toEqual(["hook", "intro", "body", "cta"]);
    expect(spans.every((p) => p.startSec === undefined && p.durationSec === undefined)).toBe(true);
  });

  it("bitişik aynı fazdaki bölümler tek parçada birleşir; zamanlı bölümler zamana göre sıralanır", () => {
    const spans = derivePhases([s("insight", 20), s("hook", 0), s("proof", 30), s("story", 10)], 50);
    expect(spans.map((p) => [p.phase, p.sections.length])).toEqual([["hook", 1], ["intro", 1], ["body", 2]]);
  });

  it("tutarsız zaman (sonraki başlangıç öncekinden küçük / süre kısa) süreyi undefined bırakır", () => {
    const spans = derivePhases([s("hook", 10), s("insight", 5)].reverse(), 4);
    expect(spans.every((p) => p.durationSec === undefined || p.durationSec >= 0)).toBe(true);
    expect(derivePhases([s("hook", 20)], 10)[0]).toMatchObject({ endSec: undefined, durationSec: undefined });
  });

  it("bölüm yoksa boş", () => {
    expect(derivePhases([], 30)).toEqual([]);
  });
});

describe("kovalar · alt sınır dahil, ölçülemeyen kovasız", () => {
  it("hook uzunluğu 1–6 / 7–12 / 13+", () => {
    expect([1, 6, 7, 12, 13, 40].map(hookLengthBucket)).toEqual(["1_6", "1_6", "7_12", "7_12", "13_plus", "13_plus"]);
    expect([0, undefined, Number.NaN, -1].map(hookLengthBucket)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("ilk bölüme geçiş <5 / 5–10 / 10–20 / 20+ (0 sn ölçülmüş: 5 sn altı)", () => {
    expect([0, 4.9, 5, 9.9, 10, 19.9, 20, 90].map(firstSectionBucket)).toEqual(["under_5", "under_5", "5_10", "5_10", "10_20", "10_20", "over_20", "over_20"]);
    expect(firstSectionBucket(undefined)).toBeUndefined();
  });

  it("CTA konumu: ≤5 son 5 sn · ≤15 sondan 6–15 · fazlası daha önce", () => {
    expect([0, 5, 5.5, 15, 15.1, 47].map(ctaPositionBucket)).toEqual(["last_5s", "last_5s", "6_15s", "6_15s", "earlier", "earlier"]);
    expect([undefined, -1].map(ctaPositionBucket)).toEqual([undefined, undefined]);
  });

  it("tempo <2 / 2–4 / 4+ kesme/dk", () => {
    expect([0, 1.9, 2, 3.9, 4, 25].map(tempoBucket)).toEqual(["under_2", "under_2", "2_4", "2_4", "over_4", "over_4"]);
    expect(tempoBucket(undefined)).toBeUndefined();
  });
});
