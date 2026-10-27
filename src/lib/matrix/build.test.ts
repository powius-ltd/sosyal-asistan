import { describe, expect, it } from "vitest";

import { NOW, RIVAL } from "@/lib/anatomy/test-fixtures";
import {
  CELL_SAMPLES_MAX,
  CELL_TOP_HOOK_TYPES_MAX,
  CREATIVE_ANGLE_IDS,
  FUNNEL_STAGE_IDS,
  type CreativeAngle,
  type FunnelStage,
} from "@/lib/domain/creative-matrix";
import { MAX_INSIGHTS_DAYS } from "@/lib/data/queries";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixInput as inputOf, rivals, SLOT, type Made } from "@/lib/matrix/test-fixtures";

const cellOf = (matrix: ReturnType<typeof buildCreativeMatrix>, stage: FunnelStage, angle: CreativeAngle) => {
  const cell = matrix.cells.find((c) => c.stage === stage && c.angle === angle);
  if (!cell) throw new Error("hücre yok");
  return cell;
};

describe("buildCreativeMatrix: iskelet", () => {
  it("etiket yokken bile 20 hücre, katman 1→5 × açı sırası, hepsi boş; lift undefined (0 değil); sebep dolu", () => {
    const matrix = buildCreativeMatrix(inputOf([{ id: "a", lift: 2 }, { id: "b", own: true, lift: 3 }]));
    expect(matrix.cells.map((c) => `${c.stage}/${c.angle}`)).toEqual(FUNNEL_STAGE_IDS.flatMap((s) => CREATIVE_ANGLE_IDS.map((a) => `${s}/${a}`)));
    for (const cell of matrix.cells) {
      expect(cell.status).toBe("empty");
      expect(cell.rivals.medianLift).toBeUndefined();
      expect(cell.own.medianLift).toBeUndefined();
      expect(cell.samples).toEqual([]);
    }
    expect(matrix.labeledCount).toBe(0);
    expect(matrix.unlabeledCount).toBe(2);
    expect(matrix.unmeasuredReason).toContain("hiçbiri etiketlenmedi");
    expect(matrix.opportunities).toEqual([]);
  });

  it("dolu matriste de 20 hücre sıralı; kapsam pencere ve saat girdiden; serileştirilebilir", () => {
    const matrix = buildCreativeMatrix(inputOf(rivals(2, 2)), { days: 30 });
    expect(matrix.cells).toHaveLength(20);
    expect(matrix.scope).toMatchObject({ workspaceId: "w", days: 30, until: NOW.toISOString() });
    expect(Date.parse(matrix.scope.until) - Date.parse(matrix.scope.since)).toBe(30 * 86_400_000);
    expect(matrix.generatedAt).toBe(NOW.toISOString());
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
    expect(buildCreativeMatrix(inputOf(rivals(1, 2)), { days: 100_000 }).scope.days).toBe(MAX_INSIGHTS_DAYS);
  });

  it("hiç video yokken sebep: kapsamda analizli video yok", () => {
    const matrix = buildCreativeMatrix(inputOf([]));
    expect(matrix.cells).toHaveLength(20);
    expect(matrix.unlabeledCount).toBe(0);
    expect(matrix.unmeasuredReason).toContain("analizli");
  });
});

describe("buildCreativeMatrix: hücre ve durum", () => {
  it("kendi ve rakip AYRI sayılır; kendi denediyse `tried`, ownTried true", () => {
    const matrix = buildCreativeMatrix(inputOf([...rivals(3, 4), { id: "mine", own: true, lift: 1.2, cell: SLOT }]));
    const cell = cellOf(matrix, ...SLOT);
    expect(cell.rivals).toMatchObject({ n: 3, liftN: 3, medianLift: 4, outlierCount: 3 });
    expect(cell.own).toMatchObject({ n: 1, medianLift: 1.2 });
    expect(cell.ownTried).toBe(true);
    expect(cell.status).toBe("tried");
    expect(matrix.labeledCount).toBe(4);
  });

  it("rakipte medyan lift > 1 ve kendi denemediyse kanıtlı fırsat; tam 1,0 fırsat DEĞİL (zayıf)", () => {
    const up = buildCreativeMatrix(inputOf(rivals(2, 1.01)));
    expect(cellOf(up, ...SLOT).status).toBe("proven_opportunity");
    const flat = buildCreativeMatrix(inputOf(rivals(2, 1)));
    expect(cellOf(flat, ...SLOT).status).toBe("weak");
    const below = buildCreativeMatrix(inputOf(rivals(2, 0.4)));
    expect(cellOf(below, ...SLOT).status).toBe("weak");
  });

  it("video var ama hiçbirinin lift'i ölçülemedi → `unmeasured`, medyan undefined (0 değil)", () => {
    const matrix = buildCreativeMatrix(inputOf(rivals(2, undefined)));
    const cell = cellOf(matrix, ...SLOT);
    expect(cell.status).toBe("unmeasured");
    expect(cell.rivals).toMatchObject({ n: 2, liftN: 0 });
    expect(cell.rivals.medianLift).toBeUndefined();
    expect(matrix.opportunities).toEqual([]);
  });

  it("olgunlaşmamış (<3 gün) lift özete girmez: n'e sayılır, liftN'e ve medyana girmez", () => {
    const specs: Made[] = [
      { id: "young", lift: 9, immature: true, daysAgo: 1, cell: SLOT },
      { id: "old1", lift: 2, cell: SLOT },
      { id: "old2", lift: 4, cell: SLOT },
    ];
    const cell = cellOf(buildCreativeMatrix(inputOf(specs)), ...SLOT);
    expect(cell.rivals).toMatchObject({ n: 3, liftN: 2, medianLift: 3 });
    const onlyYoung = cellOf(buildCreativeMatrix(inputOf([specs[0] as Made])), ...SLOT);
    expect(onlyYoung.status).toBe("unmeasured");
    expect(onlyYoung.rivals.medianLift).toBeUndefined();
  });

  it("güven örnek sayısından (5 → orta) ve baz çizgisi tavanından gelir; durumu değiştirmez", () => {
    expect(cellOf(buildCreativeMatrix(inputOf(rivals(1, 3))), ...SLOT).rivals.confidence).toBe("low");
    expect(cellOf(buildCreativeMatrix(inputOf(rivals(5, 3))), ...SLOT).rivals.confidence).toBe("medium");
    expect(cellOf(buildCreativeMatrix(inputOf(rivals(10, 3))), ...SLOT).rivals.confidence).toBe("high");
    const lowBaseline = cellOf(buildCreativeMatrix(inputOf(rivals(10, 3, SLOT, { lowConfidence: true }))), ...SLOT);
    expect(lowBaseline.rivals.confidence).toBe("medium");
    expect(lowBaseline.rivals.lowBaselineShare).toBe(1);
    expect(lowBaseline.status).toBe("proven_opportunity");
  });

  it("baskın hook türleri ≤3 (n azalan, eşitlikte ad artan); örnekler ≤5, lift azalan, ölçülemeyen sonda", () => {
    const hooks = ["liste", "liste", "soru", "soru", "itiraf", "uyari", undefined];
    const specs: Made[] = hooks.map((hookType, i) => ({ id: `v${i}`, lift: i === 6 ? undefined : 2 + i, cell: SLOT, hookType }));
    const cell = cellOf(buildCreativeMatrix(inputOf(specs)), ...SLOT);
    expect(cell.topHookTypes.map((h) => [h.hookType, h.n])).toEqual([["liste", 2], ["soru", 2], ["itiraf", 1]]);
    expect(cell.topHookTypes.length).toBeLessThanOrEqual(CELL_TOP_HOOK_TYPES_MAX);
    expect(cell.samples).toHaveLength(CELL_SAMPLES_MAX);
    const lifts = cell.samples.map((s) => s.currentLift);
    expect(lifts).toEqual([...lifts].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity)));
    expect(cell.samples.map((s) => s.isOwn)).toEqual(Array(CELL_SAMPLES_MAX).fill(false));
    expect(cell.samples[0]?.ownerHandle).toBe(RIVAL.handle);
    const mixed = cellOf(buildCreativeMatrix(inputOf([{ id: "x", cell: SLOT }, { id: "y", lift: 0.5, cell: SLOT }])), ...SLOT);
    expect(mixed.samples.map((s) => s.contentItemId)).toEqual(["y", "x"]);
  });
});

describe("buildCreativeMatrix: kapsam ve etiket kuralları", () => {
  it("yalnız doğrulanmış etiket sayılır; doğrulanmamış etiketli video hücreyi doldurmaz, unlabeledCount'a girer", () => {
    const matrix = buildCreativeMatrix(inputOf([{ id: "ok", lift: 2, cell: SLOT }, { id: "unverified", lift: 5, cell: SLOT, labelVerified: false }, { id: "none", lift: 2 }]));
    expect(cellOf(matrix, ...SLOT).rivals.n).toBe(1);
    expect(matrix.labeledCount).toBe(1);
    expect(matrix.unlabeledCount).toBe(2);
  });

  it("niş dışı, izlenmeyen rakip, pencere dışı, kısa video olmayan ve analizi doğrulanmamış video girmez", () => {
    const specs: Made[] = [
      { id: "in", lift: 2, cell: SLOT },
      { id: "off", lift: 2, cell: SLOT },
      { id: "old", lift: 2, cell: SLOT, daysAgo: 200 },
      { id: "post", lift: 2, cell: SLOT, format: "image" },
      { id: "badAnalysis", lift: 2, cell: SLOT, verified: false },
      { id: "noAnalysis", lift: 2, cell: SLOT, noAnalysis: true },
    ];
    const matrix = buildCreativeMatrix(inputOf(specs, { offNicheContentIds: ["off"] }));
    expect(cellOf(matrix, ...SLOT).rivals.n).toBe(1);
    expect(matrix.labeledCount).toBe(1);
    expect(matrix.unlabeledCount).toBe(0);
    const ignored = buildCreativeMatrix(inputOf(specs, { competitors: [{ ...RIVAL, status: "ignored" }] }));
    expect(ignored.labeledCount).toBe(0);
    const noOwn = buildCreativeMatrix(inputOf([{ id: "mine", own: true, lift: 2, cell: SLOT }], { own: [] }));
    expect(noOwn.labeledCount).toBe(0);
  });
});

describe("buildCreativeMatrix: fırsat sırası", () => {
  const A = ["hic-farkinda-degil", "aci-korku"] as const;
  const B = ["cozum-ariyor", "sonuc-kazanim"] as const;
  const C = ["sicak-musteri", "kimlik"] as const;
  const ids = (m: ReturnType<typeof buildCreativeMatrix>) => m.opportunities.map((c) => `${c.stage}/${c.angle}`);

  it("önce güven (tek videonun 9x'i 5 videonun 2x'inden önde gelmez), sonra medyan lift, sonra ön matris", () => {
    const matrix = buildCreativeMatrix(inputOf([...rivals(1, 9, A), ...rivals(5, 2, B), ...rivals(5, 3, C)]));
    // C: orta güven, 3x; B: orta güven, 2x; A: düşük güven, 9x.
    expect(ids(matrix)).toEqual(["sicak-musteri/kimlik", "cozum-ariyor/sonuc-kazanim", "hic-farkinda-degil/aci-korku"]);
    expect(matrix.opportunities.every((c) => c.status === "proven_opportunity" && !c.ownTried)).toBe(true);
  });

  it("kendi denediği hücre fırsat listesine girmez", () => {
    const matrix = buildCreativeMatrix(inputOf([...rivals(2, 3, A), { id: "mine", own: true, lift: 1, cell: A }, ...rivals(2, 3, B)]));
    expect(ids(matrix)).toEqual(["cozum-ariyor/sonuc-kazanim"]);
  });

  it("eşit güven + eşit lift: ön matris uygunluğu (birincil önce), sonra matris sırası", () => {
    // hic-farkinda-degil/aci-korku: birincil · hic-farkinda-degil/sosyal-kanit: aykırı · cozum-ariyor/sonuc-kazanim: birincil
    const aykiri = ["hic-farkinda-degil", "sosyal-kanit"] as const;
    const matrix = buildCreativeMatrix(inputOf([...rivals(2, 3, aykiri), ...rivals(2, 3, B), ...rivals(2, 3, A)]));
    expect(ids(matrix)).toEqual(["hic-farkinda-degil/aci-korku", "cozum-ariyor/sonuc-kazanim", "hic-farkinda-degil/sosyal-kanit"]);
  });
});
