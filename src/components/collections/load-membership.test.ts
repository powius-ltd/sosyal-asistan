import { describe, expect, it, vi } from "vitest";

import { loadCollectionMembership } from "@/components/collections/load-membership";

describe("loadCollectionMembership", () => {
  it("içerik kimliklerini TEK toplu okumayla sorgular ve sonucu olduğu gibi döndürür", async () => {
    const listCollectionMembership = vi.fn().mockResolvedValue({ ci_1: ["col_1"], ci_2: [] });
    const result = await loadCollectionMembership({ listCollectionMembership }, "ws_test", ["ci_1", "ci_2"]);

    expect(listCollectionMembership).toHaveBeenCalledTimes(1);
    expect(listCollectionMembership).toHaveBeenCalledWith("ws_test", ["ci_1", "ci_2"]);
    expect(result).toEqual({ ci_1: ["col_1"], ci_2: [] });
  });

  it("içerik yoksa depoya gitmez", async () => {
    const listCollectionMembership = vi.fn();
    expect(await loadCollectionMembership({ listCollectionMembership }, "ws_test", [])).toEqual({});
    expect(listCollectionMembership).not.toHaveBeenCalled();
  });

  it("okuma hatası sayfayı çökertmez: boş sonuç (düğmeler durumu bilmez), hata günlüğe yazılır", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const listCollectionMembership = vi.fn().mockRejectedValue(new Error("db kapalı"));
    expect(await loadCollectionMembership({ listCollectionMembership }, "ws_test", ["ci_1"])).toEqual({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
