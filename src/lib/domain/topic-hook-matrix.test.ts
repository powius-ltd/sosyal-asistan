import { describe, expect, it } from "vitest";

import { emptyCellStat, type CreativeCellStat, type CreativeMatrixScope } from "@/lib/domain/creative-matrix";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import {
  CLUSTER_KEY_PATTERN,
  TOPIC_CELL_STATUS,
  TOPIC_CELL_STATUS_LABEL,
  TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
  compareTopicOpportunities,
  compareTopicWinners,
  emptyTopicHookCell,
  emptyTopicHookMatrix,
  topicCellStatusOf,
  type TopicHookCell,
} from "@/lib/domain/topic-hook-matrix";

const stat = (patch: Partial<CreativeCellStat>): CreativeCellStat => ({ ...emptyCellStat(), ...patch });

function cell(clusterKey: string, hookType: string, own: Partial<CreativeCellStat>, rivals: Partial<CreativeCellStat>): TopicHookCell {
  const ownStat = stat(own);
  const rivalStat = stat(rivals);
  return { clusterKey, hookType, own: ownStat, rivals: rivalStat, ownTried: ownStat.n > 0, status: topicCellStatusOf({ own: ownStat, rivals: rivalStat }), samples: [] };
}

describe("topicCellStatusOf", () => {
  it("kendi denediyse: tutan (medyan lift > 1), zayıf (≤ 1), denendi (lift ölçülemedi)", () => {
    expect(topicCellStatusOf({ own: { n: 3, medianLift: 1.8 }, rivals: { n: 0 } })).toBe("worked");
    expect(topicCellStatusOf({ own: { n: 3, medianLift: 1 }, rivals: { n: 0 } }), "lift = 1 baz çizgisi: etki değil").toBe("weak");
    expect(topicCellStatusOf({ own: { n: 2, medianLift: 0.4 }, rivals: { n: 0 } })).toBe("weak");
    expect(topicCellStatusOf({ own: { n: 1 }, rivals: { n: 0 } }), "lift ölçülemedi ≠ 0").toBe("tried");
    // Kendi sonuç rakipten bağımsızdır: rakipte tutsa bile kendi denediyse kendi sonuç yazar.
    expect(topicCellStatusOf({ own: { n: 2, medianLift: 0.5 }, rivals: { n: 4, medianLift: 3 } })).toBe("weak");
  });

  it("kendi denemediyse açı matrisiyle aynı kural: rakip yok → boş, ölçülemedi, fırsat, zayıf", () => {
    expect(topicCellStatusOf({ own: { n: 0 }, rivals: { n: 0 } })).toBe("empty");
    expect(topicCellStatusOf({ own: { n: 0 }, rivals: { n: 2 } })).toBe("unmeasured");
    expect(topicCellStatusOf({ own: { n: 0 }, rivals: { n: 2, medianLift: 2.2 } })).toBe("proven_opportunity");
    expect(topicCellStatusOf({ own: { n: 0 }, rivals: { n: 2, medianLift: 0.9 } })).toBe("weak");
    expect(topicCellStatusOf({ own: { n: 0 }, rivals: { n: 2, medianLift: 1 } })).toBe("weak");
  });

  it("her durumun Türkçe etiketi var", () => {
    for (const status of TOPIC_CELL_STATUS) expect(TOPIC_CELL_STATUS_LABEL[status].trim(), status).not.toBe("");
  });
});

describe("boş hücre ve boş matris", () => {
  it("boş hücre: video yok, lift undefined (0 değil), durum `empty`", () => {
    const empty = emptyTopicHookCell("sabah_rutini", "question");
    expect(empty).toMatchObject({ clusterKey: "sabah_rutini", hookType: "question", ownTried: false, status: "empty", samples: [] });
    expect(empty.own.medianLift).toBeUndefined();
    expect(empty.rivals.n).toBe(0);
  });

  it("boş matris: satır yok, sebep dolu, sütunlar hook sözlüğü, serileştirilebilir", () => {
    const scope: CreativeMatrixScope = { workspaceId: "ws", days: 90, since: "2026-07-01T00:00:00.000Z", until: "2026-09-29T00:00:00.000Z" };
    const matrix = emptyTopicHookMatrix(scope, "2026-09-29T00:00:00.000Z", 4, "Konu kümesi yok.");
    expect(matrix.schemaVersion).toBe(TOPIC_HOOK_MATRIX_SCHEMA_VERSION);
    expect(matrix.hookTypes).toEqual([...HOOK_TYPES]);
    expect(matrix).toMatchObject({ rows: [], clusteredCount: 0, unclusteredCount: 4, unmeasuredReason: "Konu kümesi yok.", opportunities: [], winners: [] });
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
  });

  it("küme anahtarı biçimi DB check'i ile aynı", () => {
    for (const ok of ["a", "sabah_rutini", "k1", "a".repeat(40)]) expect(CLUSTER_KEY_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["", "A", "1a", "_a", "a-b", "a b", "a".repeat(41)]) expect(CLUSTER_KEY_PATTERN.test(bad), bad).toBe(false);
  });
});

describe("sıralama", () => {
  it("fırsatlar: rakip güveni → rakip lift → küme anahtarı → hook sırası", () => {
    const lowHigh = cell("b", "list", { n: 0 }, { n: 2, liftN: 2, medianLift: 9, confidence: "low" });
    const highLow = cell("a", "list", { n: 0 }, { n: 12, liftN: 12, medianLift: 1.5, confidence: "high" });
    const highHigh = cell("c", "question", { n: 0 }, { n: 11, liftN: 11, medianLift: 2.5, confidence: "high" });
    const tieA = cell("a", "question", { n: 0 }, { n: 5, liftN: 5, medianLift: 2, confidence: "medium" });
    const tieB = cell("a", "list", { n: 0 }, { n: 5, liftN: 5, medianLift: 2, confidence: "medium" });
    const sorted = [lowHigh, highLow, tieB, highHigh, tieA].sort(compareTopicOpportunities);
    expect(sorted.map((c) => `${c.clusterKey}/${c.hookType}`)).toEqual(["c/question", "a/list", "a/question", "a/list", "b/list"]);
  });

  it("kendi tutanlar: kendi güveni → kendi lift → tutan sayısı", () => {
    const strong = cell("a", "question", { n: 6, liftN: 6, medianLift: 2, outlierCount: 1, confidence: "medium" }, {});
    const confident = cell("b", "list", { n: 12, liftN: 12, medianLift: 1.2, outlierCount: 0, confidence: "high" }, {});
    const moreOutliers = cell("c", "list", { n: 6, liftN: 6, medianLift: 2, outlierCount: 3, confidence: "medium" }, {});
    expect([strong, confident, moreOutliers].sort(compareTopicWinners).map((c) => c.clusterKey)).toEqual(["b", "c", "a"]);
    for (const winner of [strong, confident, moreOutliers]) expect(winner.status).toBe("worked");
  });
});
