import { describe, expect, it } from "vitest";

import type { AdCreativeOutcome } from "@/lib/domain/ads";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixInput, rivals, SLOT, type Made } from "@/lib/matrix/test-fixtures";

const SPECS: Made[] = [...rivals(3, 4, SLOT), { id: "mine", own: true, lift: 1.4, cell: ["cozum-ariyor", "sonuc-kazanim"] }];

const linked: AdCreativeOutcome = { adId: "ad1", sourceContentId: "mine", outcome: "worked", confidence: "high" };

describe("buildCreativeMatrix: reklam kaynağı", () => {
  it("reklamsız girdi: hiçbir hücrede ads alanı yok ve çıktı ads: undefined ile birebir aynı", () => {
    const without = buildCreativeMatrix(matrixInput(SPECS));
    const explicit = buildCreativeMatrix(matrixInput(SPECS, { ads: undefined }));
    expect(without).toEqual(explicit);
    expect(without.cells.every((c) => !("ads" in c))).toBe(true);
  });

  it("reklam varsa 20 hücrenin hepsi ads taşır; kreatifsiz hücre untested; içeriğe bağlı kreatif içeriğin hücresine düşer", () => {
    const matrix = buildCreativeMatrix(matrixInput(SPECS, { ads: { creatives: [linked], unlabeledAdCount: 0 } }));
    expect(matrix.cells.every((c) => c.ads !== undefined)).toBe(true);
    const mine = matrix.cells.find((c) => c.stage === "cozum-ariyor" && c.angle === "sonuc-kazanim");
    expect(mine?.ads).toMatchObject({ creatives: 1, worked: 1 });
    expect(mine?.ads?.samples[0]).toMatchObject({ adRef: "ad:ad1", sourceContentId: "mine" });
    expect(matrix.cells.filter((c) => c.ads?.creatives === 0)).toHaveLength(19);
  });

  it("reklam hücre durumunu, sıralamayı ve sayaçları DEĞİŞTİRMEZ", () => {
    const plain = buildCreativeMatrix(matrixInput(SPECS));
    const withAds = buildCreativeMatrix(matrixInput(SPECS, { ads: { creatives: [linked], unlabeledAdCount: 0 } }));
    expect(withAds.cells.map((c) => ({ ...c, ads: undefined }))).toEqual(plain.cells.map((c) => ({ ...c, ads: undefined })));
    expect(withAds.opportunities.map((c) => `${c.stage}|${c.angle}|${c.status}`)).toEqual(plain.opportunities.map((c) => `${c.stage}|${c.angle}|${c.status}`));
    expect(withAds.labeledCount).toBe(plain.labeledCount);
  });

  it("etiketsiz içeriğe bağlı ve anatomisiz kreatif hücreye yazılmaz", () => {
    const orphan: AdCreativeOutcome = { adId: "ad2", sourceContentId: "yok", outcome: "worked", confidence: "high" };
    const matrix = buildCreativeMatrix(matrixInput(SPECS, { ads: { creatives: [orphan], unlabeledAdCount: 1 } }));
    expect(matrix.cells.reduce((sum, c) => sum + (c.ads?.creatives ?? 0), 0)).toBe(0);
  });
});

describe("buildCreativeMatrix: reklamsız çalışma alanı anlık görüntüsü", () => {
  it("ads verilmediğinde çıktı reklam alanı içermez (JSON anlık görüntüsünde 'ads' ve 'unlabeledAdCount' yok)", () => {
    const json = JSON.stringify(buildCreativeMatrix(matrixInput(SPECS)));
    expect(json).not.toContain('"ads"');
    expect(json).not.toContain("unlabeledAdCount");
  });
  it("etiket hiç yokken de reklam hesabı varsa 20 hücre untested, yoksa alan yok", () => {
    const none = buildCreativeMatrix(matrixInput([]));
    expect(JSON.stringify(none)).not.toContain('"ads"');
    const withAds = buildCreativeMatrix(matrixInput([], { ads: { creatives: [linked], unlabeledAdCount: 2 } }));
    expect(withAds.cells.every((c) => c.ads?.creatives === 0)).toBe(true);
    expect(withAds.unlabeledAdCount).toBe(3);
  });
});
