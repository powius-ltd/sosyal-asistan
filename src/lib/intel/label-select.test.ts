import { describe, expect, it } from "vitest";

import { selectForLabeling, type LabelCandidate } from "@/lib/intel/label-select";

const V = "label-angles-v2";
const cand = (id: string, patch: Partial<LabelCandidate> = {}): LabelCandidate => ({ id, isOwn: false, analysisStatus: "ok", hasText: true, ...patch });
const ids = (candidates: LabelCandidate[], limit?: number) => selectForLabeling(candidates, { promptVersion: V, limit }).selected.map((c) => c.id);

describe("selectForLabeling", () => {
  it("etiketsiz, analizi ok içerik seçilir; güncel sürümle etiketli atlanır, eski sürümlü yeniden seçilir", () => {
    const out = selectForLabeling([cand("a"), cand("b", { labelPromptVersion: V }), cand("c", { labelPromptVersion: "label-angles-v1" })], { promptVersion: V });
    expect(out.selected.map((c) => c.id).sort()).toEqual(["a", "c"]);
    expect(out.counts).toMatchObject({ considered: 3, eligible: 2, alreadyLabeled: 1, staleVersion: 1 });
  });

  it("niş dışı RAKİP çıkar; kendi video eleğe bakılmadan girer; elenmemiş (undefined) rakip girer", () => {
    const out = selectForLabeling(
      [cand("rival-off", { inNiche: false }), cand("rival-in", { inNiche: true }), cand("rival-none"), cand("own-off", { isOwn: true, inNiche: false })],
      { promptVersion: V },
    );
    expect(out.selected.map((c) => c.id).sort()).toEqual(["own-off", "rival-in", "rival-none"]);
    expect(out.counts.offNiche).toBe(1);
  });

  it("analizi ok olmayan (yok, failed, insufficient_data) ve metinsiz içerik seçilmez; sebep sayılır", () => {
    const out = selectForLabeling(
      [cand("none", { analysisStatus: undefined }), cand("failed", { analysisStatus: "failed" }), cand("thin", { analysisStatus: "insufficient_data" }), cand("notext", { hasText: false }), cand("ok")],
      { promptVersion: V },
    );
    expect(out.selected.map((c) => c.id)).toEqual(["ok"]);
    expect(out.counts).toMatchObject({ notAnalyzed: 3, noText: 1 });
  });

  it("sıra: kendi önce, sonra rakip lift azalan; ölçülemeyen lift (undefined) sonda ve 0 sayılmaz", () => {
    const order = ids([cand("r-low", { lift: 0.4 }), cand("r-none"), cand("r-zero", { lift: 0 }), cand("r-high", { lift: 3 }), cand("own", { isOwn: true, lift: 0.1 })]);
    expect(order).toEqual(["own", "r-high", "r-low", "r-zero", "r-none"]);
  });

  it("limit sıradan SONRA uygulanır (en öncelikli içerikler kalır); eligible limit öncesi sayıdır", () => {
    const list = [cand("r1", { lift: 1 }), cand("r2", { lift: 5 }), cand("own", { isOwn: true })];
    expect(ids(list, 2)).toEqual(["own", "r2"]);
    expect(selectForLabeling(list, { promptVersion: V, limit: 2 }).counts.eligible).toBe(3);
  });
});

describe("countLabelable (halka sayacı işle aynı kural)", () => {
  it("niş dışı rakip, metinsiz, analizi ok olmayan ve güncel etiketli içerik sayılmaz", async () => {
    const { countLabelable } = await import("@/lib/intel/label-select");
    expect(
      countLabelable(
        [
          { id: "a", isOwn: false, analysisStatus: "ok", inNiche: false, hasText: true },
          { id: "b", isOwn: false, analysisStatus: "ok", hasText: false },
          { id: "c", isOwn: false, hasText: true },
          { id: "d", isOwn: false, analysisStatus: "ok", labelPromptVersion: "v2", hasText: true },
          { id: "e", isOwn: false, analysisStatus: "ok", labelPromptVersion: "v1", hasText: true },
          { id: "f", isOwn: true, analysisStatus: "ok", hasText: true },
        ],
        "v2",
      ),
    ).toBe(2);
  });
});
