import { describe, expect, it } from "vitest";

import { buildCreativeMatrix } from "@/lib/matrix/build";
import { matrixCellHref, parseMatrixCell } from "@/lib/matrix/cell-param";
import { matrixInput, rivals, SLOT } from "@/lib/matrix/test-fixtures";
import { opportunityText } from "@/lib/matrix/text";

describe("opportunityText", () => {
  it("sayılar hücreden, tek cümle; düşük güvende dayanak yazılır; ölçülemeyen sonuç 0 değil 'ölçülemedi'", () => {
    const matrix = buildCreativeMatrix(matrixInput(rivals(6, 3.2)));
    const cell = matrix.opportunities[0];
    expect(cell && opportunityText(cell)).toBe("Acı / korku yaklaşımı · sorunu bilen izleyici: rakiplerde 6 video, tipik video normalinin 3,2 katı izlendi, 6 tanesi tutan, sen denemedin; beklenen uyum: iyi");
    const single = buildCreativeMatrix(matrixInput(rivals(1, 1.5)));
    expect(single.opportunities[0] && opportunityText(single.opportunities[0])).toContain("az örnek: 1 ölçülmüş video");
    const unmeasured = buildCreativeMatrix(matrixInput(rivals(2, undefined)));
    const cellUnmeasured = unmeasured.cells.find((c) => c.stage === SLOT[0] && c.angle === SLOT[1]);
    expect(cellUnmeasured && opportunityText(cellUnmeasured)).toContain("normaline göre ölçülemedi");
  });
});

describe("hücre parametresi", () => {
  it("geçerli değer çözülür; bozuk/bilinmeyen değer yoksayılır", () => {
    expect(parseMatrixCell("sorunu-biliyor:aci-korku")).toEqual({ stage: "sorunu-biliyor", angle: "aci-korku" });
    for (const bad of [undefined, "", "sorunu-biliyor", "x:aci-korku", "sorunu-biliyor:x", "sorunu-biliyor:aci-korku:fazla", "aci-korku:sorunu-biliyor"]) {
      expect(parseMatrixCell(bad), String(bad)).toBeUndefined();
    }
  });

  it("adres: hücre + korunan video seçimi; ikisi de yoksa düz /anatomi", () => {
    expect(matrixCellHref({ stage: "cozum-ariyor", angle: "kimlik" })).toBe("/anatomi?hucre=cozum-ariyor:kimlik");
    expect(matrixCellHref({ stage: "cozum-ariyor", angle: "kimlik" }, "ci 1")).toBe("/anatomi?hucre=cozum-ariyor:kimlik&video=ci%201");
    expect(matrixCellHref(undefined, "ci_1")).toBe("/anatomi?video=ci_1");
    expect(matrixCellHref(undefined)).toBe("/anatomi");
  });
});
