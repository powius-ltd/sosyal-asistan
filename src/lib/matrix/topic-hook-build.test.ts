import { describe, expect, it } from "vitest";

import { NOW, RIVAL } from "@/lib/anatomy/test-fixtures";
import { MAX_INSIGHTS_DAYS } from "@/lib/data/queries";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import type { TopicHookCell, TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import { buildTopicHookMatrix } from "@/lib/matrix/topic-hook-build";
import { TOPIC_OTHER_KEY, TOPIC_OTHER_LABEL, TOPIC_ROWS_MAX } from "@/lib/matrix/topic-hook-rows";
import { ownVideos, rivalVideos, topicInput, type TopicMade } from "@/lib/matrix/topic-hook-test-fixtures";

const cellOf = (matrix: TopicHookMatrix, clusterKey: string, hookType: string): TopicHookCell => {
  const cell = matrix.rows.find((r) => r.key === clusterKey)?.cells.find((c) => c.hookType === hookType);
  if (!cell) throw new Error(`hücre yok: ${clusterKey}/${hookType}`);
  return cell;
};
const keys = (cells: readonly TopicHookCell[]) => cells.map((c) => `${c.clusterKey}/${c.hookType}`);

describe("buildTopicHookMatrix: kümesiz ve boş durumlar", () => {
  it("küme satırı hiç yokken çökmez: satır yok, sütun yok, sebep 'plan ya da kümeleme koşmadı', videolar kümesiz sayılır", () => {
    const matrix = buildTopicHookMatrix(topicInput([{ id: "a", lift: 2 }, { id: "b", own: true, lift: 3 }]));
    expect(matrix.rows).toEqual([]);
    expect(matrix.hookTypes).toEqual([]);
    expect(matrix.clusteredCount).toBe(0);
    expect(matrix.unclusteredCount).toBe(2);
    expect(matrix.unmeasuredReason).toContain("kümeleme koşmadı");
    expect(matrix.opportunities).toEqual([]);
    expect(matrix.winners).toEqual([]);
  });

  it("analizli video yokken sebep analiz ister; küme satırı başka içeriğe aitse sebep 'hiçbiri kümeye girmedi'", () => {
    const none = buildTopicHookMatrix(topicInput([]));
    expect(none.unmeasuredReason).toContain("analizli");
    expect(none.unclusteredCount).toBe(0);
    const other = topicInput([{ id: "a", lift: 2 }], { clusters: [{ contentItemId: "baska", clusterKey: "k", clusterLabel: "K", clusteredAt: "2026-09-30T11:00:00.000Z" }] });
    expect(buildTopicHookMatrix(other).unmeasuredReason).toContain("hiçbiri bir konu kümesine girmedi");
  });

  it("dolu matriste kapsam, saat ve pencere girdiden; serileştirilebilir; days kırpılır", () => {
    const matrix = buildTopicHookMatrix(topicInput(rivalVideos(2, "k", 2)), { days: 30 });
    expect(matrix.scope).toMatchObject({ workspaceId: "w", days: 30, until: NOW.toISOString() });
    expect(Date.parse(matrix.scope.until) - Date.parse(matrix.scope.since)).toBe(30 * 86_400_000);
    expect(matrix.generatedAt).toBe(NOW.toISOString());
    expect(matrix.unmeasuredReason).toBeUndefined();
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
    expect(buildTopicHookMatrix(topicInput(rivalVideos(1, "k", 2)), { days: 100_000 }).scope.days).toBe(MAX_INSIGHTS_DAYS);
  });
});

describe("buildTopicHookMatrix: hook türü yalnız doğrulanmış analizden", () => {
  it("doğrulanmamış, başarısız, hook türsüz ve sözlükte olmayan hook türlü video matrise girmez (kümesiz sayılmaz da)", () => {
    const specs: TopicMade[] = [
      { id: "ok", lift: 2, cluster: "k" },
      { id: "unverified", lift: 2, cluster: "k", verified: false },
      { id: "noAnalysis", lift: 2, cluster: "k", noAnalysis: true },
      { id: "noHook", lift: 2, cluster: "k", hookType: null },
      { id: "unknownHook", lift: 2, cluster: "k", hookType: "yeni_taksonomi_turu" },
    ];
    const matrix = buildTopicHookMatrix(topicInput(specs));
    expect(matrix.clusteredCount).toBe(1);
    expect(matrix.unclusteredCount).toBe(0);
    expect(cellOf(matrix, "k", "question").rivals.n).toBe(1);
  });

  it("başarısız (`ok` olmayan) analiz hook türü olsa da sayılmaz", () => {
    const input = topicInput([{ id: "a", lift: 2, cluster: "k" }]);
    const matrix = buildTopicHookMatrix({ ...input, analyses: input.analyses.map((a) => ({ ...a, status: "failed" as const })) });
    expect(matrix.clusteredCount).toBe(0);
    expect(matrix.unmeasuredReason).toContain("analizli");
  });

  it("sütunlar yalnız verisi olan hook türleri, HOOK_TYPES sırasıyla; her satır tam o sayıda hücre taşır", () => {
    const [h0, h1, h2] = HOOK_TYPES;
    const matrix = buildTopicHookMatrix(
      topicInput([...rivalVideos(1, "a", 2, { hookType: h2 }), ...rivalVideos(1, "b", 2, { hookType: h0 }), ...rivalVideos(1, "b", 2, { hookType: h2 })]),
    );
    expect(matrix.hookTypes).toEqual([h0, h2]);
    expect(matrix.hookTypes).not.toContain(h1);
    for (const row of matrix.rows) expect(row.cells.map((c) => c.hookType)).toEqual(matrix.hookTypes);
    expect(cellOf(matrix, "a", h0 ?? "").status, "o satırda boş hücre").toBe("empty");
  });
});

describe("buildTopicHookMatrix: kapsam", () => {
  it("niş dışı, izlenmeyen rakip, pencere dışı, kısa video olmayan video girmez", () => {
    const specs: TopicMade[] = [
      { id: "in", lift: 2, cluster: "k" },
      { id: "off", lift: 2, cluster: "k" },
      { id: "old", lift: 2, cluster: "k", daysAgo: 200 },
      { id: "post", lift: 2, cluster: "k", format: "image" },
    ];
    const matrix = buildTopicHookMatrix(topicInput(specs, { offNicheContentIds: ["off"] }));
    expect(matrix.clusteredCount).toBe(1);
    expect(matrix.unclusteredCount).toBe(0);
    expect(buildTopicHookMatrix(topicInput(specs, { competitors: [{ ...RIVAL, status: "ignored" }] })).clusteredCount).toBe(0);
    expect(buildTopicHookMatrix(topicInput([{ id: "mine", own: true, lift: 2, cluster: "k" }], { own: [] })).clusteredCount).toBe(0);
  });

  it("kümesi olmayan analizli video unclusteredCount'a girer, hücreye girmez; clusteredCount hücre toplamıdır", () => {
    const matrix = buildTopicHookMatrix(topicInput([...rivalVideos(2, "k", 2), { id: "free1", lift: 2 }, { id: "free2", own: true, lift: 2 }]));
    expect(matrix.clusteredCount).toBe(2);
    expect(matrix.unclusteredCount).toBe(2);
    const total = matrix.rows.flatMap((r) => r.cells).reduce((sum, c) => sum + c.own.n + c.rivals.n, 0);
    expect(total).toBe(matrix.clusteredCount);
  });

  it("satır etiketi kümenin EN YENİ clusteredAt satırındandır", () => {
    const specs: TopicMade[] = [
      { id: "eski", lift: 2, cluster: "k", label: "Eski ad", clusteredAt: "2026-09-01T00:00:00.000Z" },
      { id: "yeni", lift: 2, cluster: "k", label: "Yeni ad", clusteredAt: "2026-09-20T00:00:00.000Z" },
    ];
    expect(buildTopicHookMatrix(topicInput(specs)).rows[0]?.label).toBe("Yeni ad");
  });
});

describe("buildTopicHookMatrix: lift ve durum (undefined ≠ 0)", () => {
  it("kendi denedi: lift ölçüldüyse tutan/zayıf (tam 1,0 tutmaz), ölçülemediyse `tried`; medyan undefined, 0 değil", () => {
    const [h0, h1, h2] = HOOK_TYPES;
    const matrix = buildTopicHookMatrix(
      topicInput([...ownVideos(2, "k", 2, { hookType: h0 }), ...ownVideos(2, "k", 1, { hookType: h1 }), ...ownVideos(2, "k", undefined, { hookType: h2 })]),
    );
    expect(cellOf(matrix, "k", h0 ?? "").status).toBe("worked");
    expect(cellOf(matrix, "k", h1 ?? "").status).toBe("weak");
    const tried = cellOf(matrix, "k", h2 ?? "");
    expect(tried.status).toBe("tried");
    expect(tried.own).toMatchObject({ n: 2, liftN: 0 });
    expect(tried.own.medianLift).toBeUndefined();
    expect(matrix.winners.map((c) => c.hookType)).toEqual([h0]);
  });

  it("olgunlaşmamış (<3 gün) lift özete girmez: n'e sayılır, liftN'e ve medyana girmez", () => {
    const specs: TopicMade[] = [
      { id: "young", own: true, lift: 9, immature: true, daysAgo: 1, cluster: "k" },
      { id: "old1", own: true, lift: 2, cluster: "k" },
      { id: "old2", own: true, lift: 4, cluster: "k" },
    ];
    const cell = cellOf(buildTopicHookMatrix(topicInput(specs)), "k", "question");
    expect(cell.own).toMatchObject({ n: 3, liftN: 2, medianLift: 3 });
    const onlyYoung = cellOf(buildTopicHookMatrix(topicInput([specs[0] as TopicMade])), "k", "question");
    expect(onlyYoung.status).toBe("tried");
    expect(onlyYoung.own.medianLift).toBeUndefined();
  });

  it("rakipte video var ama lift ölçülemedi → `unmeasured`; boş hücre medyanı undefined; güven örnek sayısından", () => {
    const [h0, h1] = HOOK_TYPES;
    const matrix = buildTopicHookMatrix(topicInput([...rivalVideos(2, "k", undefined, { hookType: h0 }), ...rivalVideos(5, "k", 3, { hookType: h1 })]));
    expect(cellOf(matrix, "k", h0 ?? "").status).toBe("unmeasured");
    expect(cellOf(matrix, "k", h0 ?? "").rivals.medianLift).toBeUndefined();
    expect(cellOf(matrix, "k", h1 ?? "").rivals.confidence).toBe("medium");
    expect(matrix.opportunities.map((c) => c.hookType)).toEqual([h1]);
  });

  it("örnekler ≤5, lift azalan (ölçülemeyen sonda), kendi/rakip işaretli ve tekrarsız", () => {
    const specs: TopicMade[] = [...rivalVideos(5, "k", 2).map((s, i) => ({ ...s, lift: 2 + i })), { id: "mine", own: true, lift: 8, cluster: "k" }, { id: "nolift", cluster: "k" }];
    const samples = cellOf(buildTopicHookMatrix(topicInput(specs)), "k", "question").samples;
    expect(samples).toHaveLength(5);
    expect(samples[0]).toMatchObject({ contentItemId: "mine", isOwn: true });
    const lifts = samples.map((s) => s.currentLift);
    expect(lifts).toEqual([...lifts].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity)));
    expect(new Set(samples.map((s) => s.contentItemId)).size).toBe(5);
  });
});

describe("buildTopicHookMatrix: rakipsiz ve rakipli", () => {
  it("rakip yokken: rakip taraf boş (undefined medyan), opportunities boş, winners kendi tutanları (güven → lift azalan)", () => {
    const [h0, h1, h2] = HOOK_TYPES;
    const matrix = buildTopicHookMatrix(
      topicInput(
        [...ownVideos(5, "a", 2, { hookType: h0 }), ...ownVideos(5, "a", 6, { hookType: h1 }), ...ownVideos(1, "b", 9, { hookType: h2 }), ...ownVideos(2, "b", 0.5, { hookType: h0 })],
        { competitors: [] },
      ),
    );
    expect(matrix.opportunities).toEqual([]);
    expect(keys(matrix.winners)).toEqual([`a/${h1}`, `a/${h0}`, `b/${h2}`]);
    for (const cell of matrix.rows.flatMap((r) => r.cells)) {
      expect(cell.rivals.n).toBe(0);
      expect(cell.rivals.medianLift).toBeUndefined();
    }
    expect(cellOf(matrix, "b", h0 ?? "").status).toBe("weak");
  });

  it("rakipli: rakipte tutup kendi denemediği hücre fırsat (güven → lift sırası); kendi denediği hücre fırsat olmaz", () => {
    const [h0, h1, h2] = HOOK_TYPES;
    const matrix = buildTopicHookMatrix(
      topicInput([
        ...rivalVideos(1, "a", 9, { hookType: h0 }),
        ...rivalVideos(5, "a", 2, { hookType: h1 }),
        ...rivalVideos(2, "a", 3, { hookType: h2 }),
        ...ownVideos(1, "a", 1.5, { hookType: h2 }),
      ]),
    );
    expect(keys(matrix.opportunities)).toEqual([`a/${h1}`, `a/${h0}`]);
    expect(cellOf(matrix, "a", h2 ?? "").status).toBe("worked");
    expect(keys(matrix.winners)).toEqual([`a/${h2}`]);
  });
});

describe("buildTopicHookMatrix: satır sınırı ve 'Diğer konular'", () => {
  const manyClusters = (count: number): TopicMade[] =>
    Array.from({ length: count }, (_, i) => rivalVideos(count - i, `k${String(i).padStart(2, "0")}`, 2)).flat();

  it(`${TOPIC_ROWS_MAX} kümeye kadar hepsi ayrı satır, 'Diğer' yok`, () => {
    const matrix = buildTopicHookMatrix(topicInput(manyClusters(TOPIC_ROWS_MAX)));
    expect(matrix.rows).toHaveLength(TOPIC_ROWS_MAX);
    expect(matrix.rows.some((r) => r.key === TOPIC_OTHER_KEY)).toBe(false);
  });

  it("sınırı aşınca en kalabalık kümeler ayrı, kalanı SONDA 'Diğer konular'; toplamlar korunur, anahtarlar tekil", () => {
    const matrix = buildTopicHookMatrix(topicInput(manyClusters(11)));
    expect(matrix.rows).toHaveLength(TOPIC_ROWS_MAX);
    const last = matrix.rows[TOPIC_ROWS_MAX - 1];
    expect(last).toMatchObject({ key: TOPIC_OTHER_KEY, label: TOPIC_OTHER_LABEL });
    expect(matrix.rows.slice(0, -1).map((r) => r.key)).toEqual(["k00", "k01", "k02", "k03", "k04", "k05", "k06"]);
    // Sonraki 4 küme (k07..k10) 4+3+2+1 = 10 video.
    expect(last?.rivals.n).toBe(10);
    expect(last?.cells[0]?.rivals.n).toBe(10);
    expect(new Set(matrix.rows.map((r) => r.key)).size).toBe(matrix.rows.length);
    expect(matrix.clusteredCount).toBe((11 * 12) / 2);
    expect(matrix.rows.reduce((sum, r) => sum + r.rivals.n, 0)).toBe(matrix.clusteredCount);
  });

  it("'Diğer konular' fırsat/tutan listelerine girmez (birden çok kümenin toplamı konu değildir)", () => {
    const own = Array.from({ length: 10 }, (_, i) => ownVideos(10 - i, `k${String(i).padStart(2, "0")}`, 5)).flat();
    const matrix = buildTopicHookMatrix(topicInput(own, { competitors: [] }));
    const other = matrix.rows.find((r) => r.key === TOPIC_OTHER_KEY);
    expect(other?.cells.some((c) => c.status === "worked")).toBe(true);
    expect(matrix.winners.some((c) => c.clusterKey === TOPIC_OTHER_KEY)).toBe(false);
  });

  it("anahtarı 'diger' olan gerçek küme 'Diğer konular'a katılır (anahtar çakışması olmaz)", () => {
    const matrix = buildTopicHookMatrix(topicInput([...rivalVideos(3, "diger", 2, { label: "Çeşitli" }), ...rivalVideos(2, "a", 2)]));
    expect(matrix.rows.map((r) => r.key)).toEqual(["a", TOPIC_OTHER_KEY]);
    expect(matrix.rows[1]).toMatchObject({ label: TOPIC_OTHER_LABEL });
    expect(matrix.rows[1]?.rivals.n).toBe(3);
  });

  it("satırlar video sayısı azalan, eşitlikte anahtar artan", () => {
    const matrix = buildTopicHookMatrix(topicInput([...rivalVideos(1, "z", 2), ...rivalVideos(3, "m", 2), ...rivalVideos(1, "b", 2)]));
    expect(matrix.rows.map((r) => r.key)).toEqual(["m", "b", "z"]);
  });
});
