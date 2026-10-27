import { describe, expect, it } from "vitest";

import { contentCountCell } from "@/components/competitors/content-count";

const at = "2026-09-30T09:00:00.000Z";

describe("contentCountCell", () => {
  it("gizli hesapta içerik yoksa 0 değil ölçülemedi + sebep", () => {
    expect(contentCountCell({ status: "private", contentCount: 0, lastCollectedAt: at })).toEqual({
      status: "unmeasured",
      reason: "Gizli hesap: içerik alınamaz.",
    });
  });

  it("bulunamayan hesapta içerik yoksa ölçülemedi + sebep", () => {
    const cell = contentCountCell({ status: "not_found", contentCount: 0, lastCollectedAt: at });
    expect(cell).toMatchObject({ status: "unmeasured", reason: expect.stringMatching(/bulunamadı/) });
  });

  it("hiç toplanmamış rakip ölçülemedi; toplanmış ve içeriksiz olan gerçek 0", () => {
    expect(contentCountCell({ status: "tracked", contentCount: 0 }).status).toBe("unmeasured");
    expect(contentCountCell({ status: "tracked", contentCount: 0, lastCollectedAt: at })).toEqual({ status: "measured", value: 0 });
  });

  it("içeriği toplanmış gizli hesapta bilinen sayı korunur", () => {
    expect(contentCountCell({ status: "private", contentCount: 12, lastCollectedAt: at })).toEqual({ status: "measured", value: 12 });
  });
});
