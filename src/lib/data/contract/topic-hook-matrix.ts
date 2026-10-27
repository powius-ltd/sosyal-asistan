/**
 * Sözleşme parçası: konu × hook türü matrisi (`getTopicHookMatrix`). ŞEKİL: sütunlar `HOOK_TYPES`'ın verisi olan alt kümesi (sıralı, tekrarsız),
 * her satır tüm sütunlar için hücre taşır, satır anahtarı tekil ve küme anahtarı biçimine uygun, satır sayısı sınırlı ("Diğer konular" sonda),
 * hücre alanları tutarlı (boş hücrede lift `undefined`, durum `topicCellStatusOf` ile aynı), örnek ≤ 5 ve tekrarsız, `clusteredCount` = hücrelerdeki
 * video toplamı, sebep yalnız hiç kümeli video yokken, fırsat/tutan listeleri sıralı ve yalnız ilgili durumdaki hücreler, serileştirilebilir,
 * `days` kırpılır, bilinmeyen workspace → `not_found`. DAVRANIŞ (kümeli seed): satırlar/hücreler dolu, kümesiz video sayılır ama hücreye girmez,
 * kendi denediği hücre fırsat olmaz, niş dışı video girmez, örnekler gerçek ve hook türü analizle tutarlı. Hesap ayrıntısı
 * `lib/matrix/topic-hook-build.test.ts`'tedir.
 */
import { expect, it } from "vitest";

import { DEFAULT_INSIGHTS_DAYS, MAX_INSIGHTS_DAYS, MIN_INSIGHTS_DAYS } from "@/lib/data/queries";
import { expectCode, type ContractContext } from "@/lib/data/contract/support";
import type { CreativeCellStat } from "@/lib/domain/creative-matrix";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import {
  CLUSTER_KEY_PATTERN,
  CLUSTER_LABEL_MAX_CHARS,
  TOPIC_CELL_SAMPLES_MAX,
  TOPIC_CELL_STATUS,
  TOPIC_HOOK_MATRIX_SCHEMA_VERSION,
  compareTopicOpportunities,
  compareTopicWinners,
  topicCellStatusOf,
} from "@/lib/domain/topic-hook-matrix";
import { TOPIC_OTHER_KEY, TOPIC_ROWS_MAX } from "@/lib/matrix/topic-hook-rows";

function expectStatShape(stat: CreativeCellStat, label: string) {
  expect(Number.isInteger(stat.n) && stat.n >= 0, `${label}: n`).toBe(true);
  expect(stat.liftN, `${label}: liftN ≤ n`).toBeLessThanOrEqual(stat.n);
  expect(stat.outlierCount, `${label}: tutan sayısı ölçülen videoları aşmaz`).toBeLessThanOrEqual(stat.liftN);
  if (stat.liftN === 0) expect(stat.medianLift, `${label}: lift ölçülmediyse 0 değil undefined`).toBeUndefined();
  else expect(stat.medianLift, `${label}: lift ölçüldüyse medyan dolu`).toBeDefined();
  if (stat.n === 0) expect(stat.medianViews, `${label}: boş tarafta izlenme yok`).toBeUndefined();
}

export function topicHookMatrixContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("getTopicHookMatrix: sütunlar verisi olan hook türleri, her satır tüm sütunlar için hücre taşır; kapsam ve serileştirilebilir şekil", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    expect(matrix.schemaVersion).toBe(TOPIC_HOOK_MATRIX_SCHEMA_VERSION);
    expect(Date.parse(matrix.generatedAt)).not.toBeNaN();
    expect(matrix.scope).toMatchObject({ workspaceId: wsId, days: DEFAULT_INSIGHTS_DAYS });
    expect(Date.parse(matrix.scope.until)).toBeGreaterThan(Date.parse(matrix.scope.since));
    expect(matrix.hookTypes, "sütunlar HOOK_TYPES'ın sıralı alt kümesi (tekrarsız)").toEqual(HOOK_TYPES.filter((hook) => matrix.hookTypes.includes(hook)));
    expect(matrix.rows.length, `satır sayısı ≤ ${TOPIC_ROWS_MAX}`).toBeLessThanOrEqual(TOPIC_ROWS_MAX);
    expect(matrix.rows.findIndex((row) => row.key === TOPIC_OTHER_KEY), "'Diğer konular' varsa SONDA").toBeOneOf([-1, matrix.rows.length - 1]);
    expect(new Set(matrix.rows.map((row) => row.key)).size, "satır anahtarı tekil").toBe(matrix.rows.length);
    for (const row of matrix.rows) {
      expect(CLUSTER_KEY_PATTERN.test(row.key), `küme anahtarı biçimi: ${row.key}`).toBe(true);
      expect(row.label.trim().length, `${row.key}: etiket dolu`).toBeGreaterThan(0);
      expect(Array.from(row.label).length, `${row.key}: etiket ≤ ${CLUSTER_LABEL_MAX_CHARS}`).toBeLessThanOrEqual(CLUSTER_LABEL_MAX_CHARS);
      expect(row.cells.map((cell) => cell.hookType), `${row.key}: hücreler hook sırasıyla`).toEqual(matrix.hookTypes);
      for (const cell of row.cells) expect(cell.clusterKey, `${row.key}: hücre kendi satırının anahtarını taşır`).toBe(row.key);
    }
    expect(Number.isInteger(matrix.clusteredCount) && matrix.clusteredCount >= 0).toBe(true);
    expect(Number.isInteger(matrix.unclusteredCount) && matrix.unclusteredCount >= 0).toBe(true);
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
  });

  it("getTopicHookMatrix: hücre alanları tutarlı; boş hücrede lift undefined (0 değil) ve durum `empty`; durum kodla türer", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    let videos = 0;
    for (const row of matrix.rows) {
      let rowOwn = 0;
      let rowRivals = 0;
      for (const cell of row.cells) {
        const label = `${row.key}/${cell.hookType}`;
        expectStatShape(cell.own, `${label} kendi`);
        expectStatShape(cell.rivals, `${label} rakip`);
        videos += cell.own.n + cell.rivals.n;
        rowOwn += cell.own.n;
        rowRivals += cell.rivals.n;
        expect(cell.ownTried, `${label}: ownTried = kendi n > 0`).toBe(cell.own.n > 0);
        expect(cell.status, `${label}: durum topicCellStatusOf ile aynı`).toBe(topicCellStatusOf(cell));
        expect(TOPIC_CELL_STATUS).toContain(cell.status);
        expect(cell.samples.length).toBeLessThanOrEqual(TOPIC_CELL_SAMPLES_MAX);
        expect(cell.samples.length, `${label}: örnek sayısı video sayısını aşmaz`).toBeLessThanOrEqual(cell.own.n + cell.rivals.n);
        expect(new Set(cell.samples.map((s) => s.contentItemId)).size, `${label}: örnek tekrarsız`).toBe(cell.samples.length);
        if (cell.own.n === 0) expect(cell.samples.some((s) => s.isOwn), `${label}: kendi videosu yoksa kendi örnek yok`).toBe(false);
        if (cell.rivals.n === 0) expect(cell.samples.every((s) => s.isOwn), `${label}: rakip videosu yoksa rakip örnek yok`).toBe(true);
        if (cell.own.n === 0 && cell.rivals.n === 0) {
          expect(cell.status, `${label}: kimse denemediyse boş`).toBe("empty");
          expect(cell.samples).toEqual([]);
        }
      }
      expect(row.own.n, `${row.key}: satır toplamı kendi = hücre toplamı`).toBe(rowOwn);
      expect(row.rivals.n, `${row.key}: satır toplamı rakip = hücre toplamı`).toBe(rowRivals);
    }
    expect(matrix.clusteredCount, "clusteredCount = hücrelerdeki video toplamı").toBe(videos);
    expect(matrix.unmeasuredReason !== undefined, "sebep yalnız hiç kümeli video yokken").toBe(matrix.clusteredCount === 0);
    if (matrix.unmeasuredReason !== undefined) {
      expect(matrix.unmeasuredReason.trim().length).toBeGreaterThan(0);
      expect(matrix.rows, "kümeli video yoksa satır yok").toEqual([]);
      expect(matrix.hookTypes, "kümeli video yoksa sütun yok").toEqual([]);
    }
    for (const hook of matrix.hookTypes) {
      expect(matrix.rows.some((row) => row.cells.some((cell) => cell.hookType === hook && cell.own.n + cell.rivals.n > 0)), `${hook}: sütunun verisi var`).toBe(true);
    }
  });

  it("getTopicHookMatrix: fırsatlar = kanıtlı fırsat hücreleri, tutanlar = tutan hücreleri; ikisi de kendi sırasıyla", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    // "Diğer konular" birden çok kümenin toplamıdır: listelere girmez.
    const cells = matrix.rows.filter((row) => row.key !== TOPIC_OTHER_KEY).flatMap((row) => row.cells);
    const key =(c: { clusterKey: string; hookType: string }) => `${c.clusterKey}/${c.hookType}`;
    expect(matrix.opportunities.map(key)).toEqual(cells.filter((c) => c.status === "proven_opportunity").sort(compareTopicOpportunities).map(key));
    expect(matrix.winners.map(key)).toEqual(cells.filter((c) => c.status === "worked").sort(compareTopicWinners).map(key));
    for (const cell of matrix.opportunities) {
      expect(cell.ownTried, "fırsat: kendi denemedi").toBe(false);
      expect(cell.rivals.medianLift, "fırsat: rakipte etki > 1").toBeGreaterThan(1);
    }
    for (const cell of matrix.winners) {
      expect(cell.ownTried, "tutan: kendi denedi").toBe(true);
      expect(cell.own.medianLift, "tutan: kendi etki > 1").toBeGreaterThan(1);
    }
  });

  // Davranış (seed'li, kümeli workspace): hesap `lib/matrix` `buildTopicHookMatrix` testlerinde ayrıntılı sınanır; burada depoların girdiyi doğru
  // kurduğu (kapsam, niş dışı, kümesiz, sahip türü, hook türü) iki uygulamada AYNI sonuçla doğrulanır.
  it("getTopicHookMatrix: kümeli seed: satırlar ve hücreler dolu, kümesiz video sayılır ama hücreye girmez, fırsat var; sebep yok", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    expect(matrix.clusteredCount, "seed'de kümeli video var").toBeGreaterThan(0);
    expect(matrix.unmeasuredReason, "kümeli video varken sebep yok").toBeUndefined();
    expect(matrix.rows.length).toBeGreaterThan(0);
    expect(matrix.hookTypes.length).toBeGreaterThan(0);
    expect(matrix.unclusteredCount, "kümesi olmayan analizli video sayılır").toBeGreaterThan(0);
    const cells = matrix.rows.flatMap((row) => row.cells);
    expect(cells.some((c) => c.rivals.n > 0), "rakip tarafı dolu hücre").toBe(true);
    expect(cells.some((c) => c.own.n > 0), "kendi tarafı dolu hücre").toBe(true);
    expect(matrix.opportunities.length, "rakipte tutup kendi denemediği hücre").toBeGreaterThan(0);
    const named = matrix.rows.filter((row) => row.key !== TOPIC_OTHER_KEY).map((row) => row.own.n + row.rivals.n);
    expect(named, "adlandırılmış satırlar video sayısı azalan").toEqual([...named].sort((a, b) => b - a));
  });

  it("getTopicHookMatrix: kendi denediği hücre fırsat/boş olmaz (tutan, zayıf ya da denendi); niş dışı video matriste yok", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    const cells = matrix.rows.flatMap((row) => row.cells);
    for (const cell of cells.filter((c) => c.ownTried)) {
      expect(["worked", "weak", "tried"], `${cell.clusterKey}/${cell.hookType}: kendi denediyse`).toContain(cell.status);
    }
    const offNiche = await ctx.offNicheIds();
    for (const sample of cells.flatMap((c) => c.samples)) {
      expect(offNiche.has(sample.contentItemId), `niş dışı video matriste: ${sample.contentItemId}`).toBe(false);
    }
  });

  it("getTopicHookMatrix: örnek videolar gerçek, sahip türü tutarlı, hook türü doğrulanmış analizle aynı; kümeli + kümesiz ≤ anatomideki analizli video", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    const matrix = await r.getTopicHookMatrix(wsId);
    const withSample = matrix.rows.flatMap((row) => row.cells).filter((c) => c.samples.length > 0);
    expect(withSample.length).toBeGreaterThan(0);
    for (const cell of withSample.slice(0, 8)) {
      for (const sample of cell.samples.slice(0, 2)) {
        const detail = await r.getContent(wsId, sample.contentItemId);
        expect(detail, `örnek içerik okunabilir: ${sample.contentItemId}`).not.toBeNull();
        expect(detail?.item.format, "yalnız kısa video").toBe("short_video");
        expect(detail?.item.owner.kind, "isOwn = sahip kendi hesap").toBe(sample.isOwn ? "own" : "competitor");
        expect(detail?.analysis?.status, "yalnız analizli video").toBe("ok");
        expect(detail?.analysis?.evidenceVerified, "yalnız kanıtı doğrulanmış analiz").toBe(true);
        expect(detail?.analysis?.hookType, "hücrenin hook türü = analizdeki hook türü").toBe(cell.hookType);
      }
    }
    const anatomy = await r.getAnatomy(wsId);
    expect(matrix.clusteredCount + matrix.unclusteredCount, "matrise girebilecek video analizli videoları aşmaz").toBeLessThanOrEqual(anatomy.counts.analyzed);
  });

  it("getTopicHookMatrix: days kırpılır; bilinmeyen workspace → not_found", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "topic_hook_matrix", () => r.getTopicHookMatrix(wsId));
    expect((await r.getTopicHookMatrix(wsId, { days: 1 })).scope.days).toBe(MIN_INSIGHTS_DAYS);
    expect((await r.getTopicHookMatrix(wsId, { days: 100_000 })).scope.days).toBe(MAX_INSIGHTS_DAYS);
    await expectCode(r.getTopicHookMatrix(foreign), "not_found");
  });
}
