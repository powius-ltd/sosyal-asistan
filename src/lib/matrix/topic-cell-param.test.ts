import { describe, expect, it } from "vitest";

import { TOPIC_CELL_PARAM, parseTopicCell, topicCellHref } from "@/lib/matrix/topic-cell-param";

describe("konu hücresi adres parametresi (?konu=)", () => {
  it("geçerli değer ayrışır; adres üretimi parametreyi geri verir", () => {
    expect(TOPIC_CELL_PARAM).toBe("konu");
    expect(parseTopicCell("sabah_rutini:question")).toEqual({ clusterKey: "sabah_rutini", hookType: "question" });
    const cell = { clusterKey: "uyku_enerji", hookType: "shock_stat" };
    expect(topicCellHref(cell)).toBe("/anatomi?konu=uyku_enerji:shock_stat");
    const url = new URL(topicCellHref(cell), "http://x");
    expect(parseTopicCell(url.searchParams.get(TOPIC_CELL_PARAM) ?? undefined)).toEqual(cell);
  });

  it("tanımsız, biçimsiz küme, sözlükte olmayan hook ve fazla parça → undefined (seçim yok)", () => {
    for (const raw of [undefined, "", "sabah_rutini", "sabah_rutini:", ":question", "Sabah:question", "sabah_rutini:bilinmeyen", "a:question:fazla", "sorunu-biliyor:aci-korku"]) {
      expect(parseTopicCell(raw), String(raw)).toBeUndefined();
    }
  });

  it("seçimsiz adres matris sayfasıdır; video seçimi korunur (kodlanır)", () => {
    expect(topicCellHref(undefined)).toBe("/anatomi");
    expect(topicCellHref({ clusterKey: "k", hookType: "list" }, "a b")).toBe("/anatomi?konu=k:list&video=a%20b");
    expect(topicCellHref(undefined, "x1")).toBe("/anatomi?video=x1");
  });
});
