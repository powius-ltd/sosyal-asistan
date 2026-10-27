import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

describe("mock · konu × hook türü matrisi (dolu örnek)", () => {
  it("birden çok konu satırı, dolu hücreler, kümesiz video sayısı ve en az bir tutan/fırsat durumu var", async () => {
    const matrix = await createMockRepository().getTopicHookMatrix(MOCK_WORKSPACE_ID);
    expect(matrix.unmeasuredReason).toBeUndefined();
    expect(matrix.rows.length).toBeGreaterThan(1);
    expect(matrix.clusteredCount).toBeGreaterThan(0);
    expect(matrix.unclusteredCount, "~1/6'sı kümesiz").toBeGreaterThan(0);
    const cells = matrix.rows.flatMap((row) => row.cells);
    expect(cells.some((c) => c.own.n > 0), "kendi tarafı dolu hücre").toBe(true);
    expect(cells.some((c) => c.rivals.n > 0), "rakip tarafı dolu hücre").toBe(true);
    expect(cells.some((c) => c.samples.length > 0)).toBe(true);
    expect(matrix.rows.map((r) => r.own.n + r.rivals.n), "satırlar video sayısı azalan").toEqual([...matrix.rows.map((r) => r.own.n + r.rivals.n)].sort((a, b) => b - a));
    expect(new Set(cells.map((c) => c.status)).size, "birden çok durum görünür").toBeGreaterThan(1);
  });
});
