/**
 * Sözleşme parçası: Kreatif Matris (`getCreativeMatrix`). ŞEKİL: her zaman 20 hücre sıralı, ön matris tam, boş hücrede lift `undefined`
 * (0 değil) ve durum `empty`, durum/özet alanları birbiriyle tutarlı, fırsat listesi sıralı, serileştirilebilir, `days` kırpılır, bilinmeyen
 * workspace → `not_found`. DAVRANIŞ (etiketli seed): hücreler dolu, kendi denediği hücre `tried`, fırsat var, niş dışı/analizsiz video girmez,
 * örnekler gerçek ve sahip türü tutarlı, kapsam `getAnatomy` ile aynı. Hesap ayrıntısı `lib/matrix/build.test.ts`'tedir.
 */
import { expect, it } from "vitest";

import {
  CELL_SAMPLES_MAX,
  CELL_STATUS,
  CELL_TOP_HOOK_TYPES_MAX,
  CREATIVE_ANGLE_IDS,
  CREATIVE_MATRIX_SCHEMA_VERSION,
  FUNNEL_STAGE_IDS,
  cellStatusOf,
  compareOpportunities,
  priorFitOf,
  type CreativeCellStat,
} from "@/lib/domain/creative-matrix";
import { DEFAULT_INSIGHTS_DAYS, MAX_INSIGHTS_DAYS, MIN_INSIGHTS_DAYS } from "@/lib/data/queries";
import { expectCode, type ContractContext } from "@/lib/data/contract/support";

function expectStatShape(stat: CreativeCellStat, label: string) {
  expect(Number.isInteger(stat.n) && stat.n >= 0, `${label}: n`).toBe(true);
  expect(stat.liftN, `${label}: liftN ≤ n`).toBeLessThanOrEqual(stat.n);
  expect(stat.outlierCount, `${label}: tutan sayısı ölçülen videoları aşmaz`).toBeLessThanOrEqual(stat.liftN);
  if (stat.liftN === 0) expect(stat.medianLift, `${label}: lift ölçülmediyse 0 değil undefined`).toBeUndefined();
  else expect(stat.medianLift, `${label}: lift ölçüldüyse medyan dolu`).toBeDefined();
  if (stat.n === 0) expect(stat.medianViews, `${label}: boş tarafta izlenme yok`).toBeUndefined();
}

export function creativeMatrixContract(ctx: ContractContext): void {
  const { wsId, foreign, create } = ctx;

  it("getCreativeMatrix: 20 hücre sıralı, ön matris tam; kapsam ve serileştirilebilir şekil", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    const matrix = await r.getCreativeMatrix(wsId);
    expect(matrix.schemaVersion).toBe(CREATIVE_MATRIX_SCHEMA_VERSION);
    expect(Date.parse(matrix.generatedAt)).not.toBeNaN();
    expect(matrix.scope).toMatchObject({ workspaceId: wsId, days: DEFAULT_INSIGHTS_DAYS });
    expect(Date.parse(matrix.scope.until)).toBeGreaterThan(Date.parse(matrix.scope.since));
    // HER ZAMAN 20 hücre: katman 1→5, her katmanda açı sırasıyla; ön matris taksonomiyle aynı.
    expect(matrix.cells.map((c) => `${c.stage}/${c.angle}`)).toEqual(FUNNEL_STAGE_IDS.flatMap((s) => CREATIVE_ANGLE_IDS.map((a) => `${s}/${a}`)));
    for (const cell of matrix.cells) expect(cell.prior, `${cell.stage}/${cell.angle}`).toBe(priorFitOf(cell.angle, cell.stage));
    expect(Number.isInteger(matrix.labeledCount) && matrix.labeledCount >= 0).toBe(true);
    expect(Number.isInteger(matrix.unlabeledCount) && matrix.unlabeledCount >= 0).toBe(true);
    expect(JSON.parse(JSON.stringify(matrix))).toEqual(matrix);
  });

  it("getCreativeMatrix: hücre alanları tutarlı; boş hücrede lift undefined (0 değil) ve durum `empty`; durum kodla türer", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    const matrix = await r.getCreativeMatrix(wsId);
    let videos = 0;
    for (const cell of matrix.cells) {
      const label = `${cell.stage}/${cell.angle}`;
      expectStatShape(cell.own, `${label} kendi`);
      expectStatShape(cell.rivals, `${label} rakip`);
      videos += cell.own.n + cell.rivals.n;
      expect(cell.ownTried, `${label}: ownTried = kendi n > 0`).toBe(cell.own.n > 0);
      expect(cell.status, `${label}: durum cellStatusOf ile aynı`).toBe(cellStatusOf(cell));
      expect(CELL_STATUS).toContain(cell.status);
      expect(cell.topHookTypes.length).toBeLessThanOrEqual(CELL_TOP_HOOK_TYPES_MAX);
      expect(cell.samples.length).toBeLessThanOrEqual(CELL_SAMPLES_MAX);
      expect(cell.samples.length, `${label}: örnek sayısı video sayısını aşmaz`).toBeLessThanOrEqual(cell.own.n + cell.rivals.n);
      expect(new Set(cell.samples.map((s) => s.contentItemId)).size, `${label}: örnek tekrarsız`).toBe(cell.samples.length);
      if (cell.own.n === 0) expect(cell.samples.some((s) => s.isOwn), `${label}: kendi videosu yoksa kendi örnek yok`).toBe(false);
      if (cell.rivals.n === 0) expect(cell.samples.every((s) => s.isOwn), `${label}: rakip videosu yoksa rakip örnek yok`).toBe(true);
      if (cell.own.n === 0 && cell.rivals.n === 0) {
        expect(cell.status, `${label}: kimse denemediyse boş`).toBe("empty");
        expect(cell.topHookTypes).toEqual([]);
        expect(cell.samples).toEqual([]);
      }
    }
    expect(matrix.labeledCount, "labeledCount = hücrelerdeki video toplamı").toBe(videos);
    expect(matrix.unmeasuredReason !== undefined, "sebep yalnız hiç etiket yoksa").toBe(matrix.labeledCount === 0);
    if (matrix.unmeasuredReason !== undefined) expect(matrix.unmeasuredReason.trim().length).toBeGreaterThan(0);
  });

  it("getCreativeMatrix: fırsat listesi = kanıtlı fırsat hücreleri, fırsat sırasıyla (güven → lift)", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    const matrix = await r.getCreativeMatrix(wsId);
    const expected = matrix.cells.filter((c) => c.status === "proven_opportunity").sort(compareOpportunities);
    expect(matrix.opportunities.map((c) => `${c.stage}/${c.angle}`)).toEqual(expected.map((c) => `${c.stage}/${c.angle}`));
    for (const cell of matrix.opportunities) {
      expect(cell.ownTried, "fırsat: kendi denemedi").toBe(false);
      expect(cell.rivals.medianLift, "fırsat: rakipte etki > 1").toBeGreaterThan(1);
    }
  });

  // Davranış (seed'li, etiketli workspace): hesap `lib/matrix` `buildCreativeMatrix` testlerinde ayrıntılı sınanır; burada depoların girdiyi
  // doğru kurduğu (kapsam, niş dışı, sahip türü) iki uygulamada AYNI sonuçla doğrulanır.
  it("getCreativeMatrix: etiketli seed: hücreler dolu, kendi denediği hücre `tried`, fırsatlar var; niş dışı örnek yok", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    const matrix = await r.getCreativeMatrix(wsId);
    expect(matrix.labeledCount, "seed'de etiketli video var").toBeGreaterThan(0);
    expect(matrix.unmeasuredReason, "etiket varken sebep yok").toBeUndefined();
    expect(matrix.cells.some((c) => c.rivals.n > 0), "rakip tarafı dolu hücre").toBe(true);
    const tried = matrix.cells.filter((c) => c.ownTried);
    expect(tried.length, "kendi denediği hücre").toBeGreaterThan(0);
    for (const cell of tried) expect(cell.status, "kendi denediyse `tried`").toBe("tried");
    expect(matrix.opportunities.length, "rakipte tutup kendi denemediği hücre").toBeGreaterThan(0);
    const offNiche = await ctx.offNicheIds();
    for (const cell of matrix.cells) {
      for (const sample of cell.samples) expect(offNiche.has(sample.contentItemId), `niş dışı video matriste: ${sample.contentItemId}`).toBe(false);
    }
  });

  it("getCreativeMatrix: örnek videolar gerçek, kapsamda ve sahip türü tutarlı; etiketli + etiketsiz = analizli video (getAnatomy ile aynı kapsam)", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    const matrix = await r.getCreativeMatrix(wsId);
    const samples = matrix.cells.flatMap((c) => c.samples).slice(0, 12);
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      const detail = await r.getContent(wsId, sample.contentItemId);
      expect(detail, `örnek içerik okunabilir: ${sample.contentItemId}`).not.toBeNull();
      expect(detail?.item.format, "yalnız kısa video").toBe("short_video");
      expect(detail?.item.owner.kind, "isOwn = sahip kendi hesap").toBe(sample.isOwn ? "own" : "competitor");
      expect(detail?.item.owner.handle).toBe(sample.ownerHandle);
      expect(detail?.analysis?.status, "yalnız analizli video").toBe("ok");
      expect(detail?.analysis?.evidenceVerified, "yalnız kanıtı doğrulanmış analiz").toBe(true);
    }
    const anatomy = await r.getAnatomy(wsId);
    expect(matrix.labeledCount + matrix.unlabeledCount, "etiketlenebilir video sayısı anatomideki analizli video sayısıyla aynı").toBe(anatomy.counts.analyzed);
  });

  it("getCreativeMatrix: days kırpılır; bilinmeyen workspace → not_found", async (t) => {
    const r = create();
    await ctx.skipIfPending(t, "creative_matrix", () => r.getCreativeMatrix(wsId));
    expect((await r.getCreativeMatrix(wsId, { days: 1 })).scope.days).toBe(MIN_INSIGHTS_DAYS);
    expect((await r.getCreativeMatrix(wsId, { days: 100_000 })).scope.days).toBe(MAX_INSIGHTS_DAYS);
    await expectCode(r.getCreativeMatrix(foreign), "not_found");
  });
}
