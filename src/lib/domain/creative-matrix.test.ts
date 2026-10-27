import { describe, expect, it } from "vitest";

import {
  ANGLE_FUNNEL_PRIOR,
  CELL_STATUS,
  CELL_STATUS_LABEL,
  CREATIVE_ANGLES,
  CREATIVE_ANGLE_IDS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_IDS,
  PRIOR_FITS,
  cellStatusOf,
  compareOpportunities,
  emptyCellStat,
  emptyCreativeMatrix,
  priorFitOf,
  type CreativeCellStat,
  type CreativeMatrixCell,
} from "@/lib/domain/creative-matrix";

/** Kullanıcının taksonomisindeki `aci_x_funnel` (sütunlar: sonuc-kazanim · aci-korku · kimlik · sosyal-kanit). b/i/a = birincil/ikincil/aykırı. */
const TAXONOMY_PRIOR: Record<string, string> = {
  "hic-farkinda-degil": "a b i a",
  "sorunu-biliyor": "i b b a",
  "cozum-ariyor": "b i a i",
  "urunu-biliyor": "i a i b",
  "sicak-musteri": "i a b i",
};
const FIT = { b: "birincil", i: "ikincil", a: "aykiri" } as const;

const stat = (n: number, medianLift?: number, confidence: CreativeCellStat["confidence"] = "low"): CreativeCellStat => ({
  n,
  liftN: medianLift === undefined ? 0 : n,
  medianLift,
  outlierCount: 0,
  confidence,
});

describe("eksenler + ön matris", () => {
  it("eksen listeleri tutarlı: 4 açı × 5 katman, sıra ve etiket dolu", () => {
    expect(CREATIVE_ANGLES.map((a) => a.id)).toEqual([...CREATIVE_ANGLE_IDS]);
    expect(FUNNEL_STAGES.map((s) => s.id)).toEqual([...FUNNEL_STAGE_IDS]);
    expect(FUNNEL_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    for (const item of [...CREATIVE_ANGLES, ...FUNNEL_STAGES]) expect(item.label.trim().length).toBeGreaterThan(0);
    for (const stage of FUNNEL_STAGES) expect(stage.mindset.trim().length).toBeGreaterThan(0);
  });

  it("ön matris 20 hücre TAM ve taksonomiyle birebir", () => {
    expect(Object.keys(ANGLE_FUNNEL_PRIOR)).toEqual([...FUNNEL_STAGE_IDS]);
    let cells = 0;
    for (const stage of FUNNEL_STAGE_IDS) {
      expect(Object.keys(ANGLE_FUNNEL_PRIOR[stage]), stage).toEqual([...CREATIVE_ANGLE_IDS]);
      const expected = TAXONOMY_PRIOR[stage].split(" ").map((c) => FIT[c as keyof typeof FIT]);
      CREATIVE_ANGLE_IDS.forEach((angle, index) => {
        expect(PRIOR_FITS).toContain(ANGLE_FUNNEL_PRIOR[stage][angle]);
        expect(priorFitOf(angle, stage), `${stage} × ${angle}`).toBe(expected[index]);
        cells += 1;
      });
    }
    expect(cells).toBe(20);
  });
});

describe("cellStatusOf", () => {
  it("kendi denediyse sonucu ne olursa olsun `tried`", () => {
    expect(cellStatusOf({ own: stat(1, 0.4), rivals: stat(5, 3) })).toBe("tried");
    expect(cellStatusOf({ own: stat(2), rivals: stat(0) })).toBe("tried");
  });

  it("kimse denemediyse `empty` (lift 0 değil, ölçülmedi)", () => {
    expect(cellStatusOf({ own: emptyCellStat(), rivals: emptyCellStat() })).toBe("empty");
    expect(emptyCellStat().medianLift).toBeUndefined();
  });

  it("rakip videosu var ama hiçbirinin lift'i ölçülemediyse `unmeasured` (fırsat/zayıf demez)", () => {
    expect(cellStatusOf({ own: emptyCellStat(), rivals: stat(3) })).toBe("unmeasured");
  });

  it("kanıtlı fırsat: rakip medyan lift > 1 ve kendi denemedi; tam 1 etki sayılmaz", () => {
    expect(cellStatusOf({ own: emptyCellStat(), rivals: stat(4, 1.01) })).toBe("proven_opportunity");
    expect(cellStatusOf({ own: emptyCellStat(), rivals: stat(4, 1) })).toBe("weak");
    expect(cellStatusOf({ own: emptyCellStat(), rivals: stat(4, 0.6) })).toBe("weak");
  });

  it("her durumun Türkçe etiketi var", () => {
    for (const status of CELL_STATUS) expect(CELL_STATUS_LABEL[status].length).toBeGreaterThan(0);
  });
});

describe("compareOpportunities + emptyCreativeMatrix", () => {
  const cell = (index: number, rivals: CreativeCellStat): CreativeMatrixCell => {
    const base = emptyCreativeMatrix({ workspaceId: "w", days: 90, since: "", until: "" }, "").cells[index];
    return { ...base, rivals, status: "proven_opportunity" };
  };

  it("sıra: güven, sonra medyan lift, sonra matris sırası", () => {
    const lowBig = cell(0, stat(1, 9, "low"));
    const highSmall = cell(5, stat(12, 1.4, "high"));
    const highBig = cell(7, stat(12, 2.2, "high"));
    const tie = cell(6, stat(12, 2.2, "high"));
    expect([lowBig, highSmall, tie, highBig].sort(compareOpportunities)).toEqual([tie, highBig, highSmall, lowBig]);
  });

  it("boş matris her zaman 20 hücre, sıralı, ön matris dolu, sebep yazılı", () => {
    const matrix = emptyCreativeMatrix({ workspaceId: "w", days: 90, since: "a", until: "b" }, "2026-10-01T00:00:00.000Z");
    expect(matrix.cells).toHaveLength(20);
    expect(matrix.cells.map((c) => `${c.stage}/${c.angle}`)).toEqual(FUNNEL_STAGE_IDS.flatMap((s) => CREATIVE_ANGLE_IDS.map((a) => `${s}/${a}`)));
    for (const c of matrix.cells) {
      expect(c.status).toBe("empty");
      expect(c.prior).toBe(priorFitOf(c.angle, c.stage));
      expect(c.own.medianLift).toBeUndefined();
    }
    expect(matrix.unmeasuredReason).toBeTruthy();
    expect(matrix.opportunities).toEqual([]);
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
  });
});
