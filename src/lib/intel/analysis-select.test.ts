import { describe, expect, it } from "vitest";

import { pickScreeningBatch, selectForAnalysis, CONTRAST_LIMIT, type AnalysisCandidate } from "@/lib/intel/analysis-select";
import type { LiftTier } from "@/lib/domain/content";

let seq = 0;
function cand(partial: Partial<AnalysisCandidate> & { tier?: LiftTier }): AnalysisCandidate {
  const { tier, ...rest } = partial;
  seq += 1;
  return { id: `c${seq}`, isOwn: false, handle: "rival", liftTier: tier, ...rest };
}

const ids = (list: readonly AnalysisCandidate[]) => list.map((c) => c.id);

describe("selectForAnalysis: sıra", () => {
  it("kendi → rakip ≥3x → kademe 2 → kontrast → kalan", () => {
    const own = cand({ id: "own1", isOwn: true, lift: 1 });
    const t4 = cand({ id: "t4", lift: 9, tier: 4 });
    const t3 = cand({ id: "t3", lift: 3.5, tier: 3 });
    const t2 = cand({ id: "t2", lift: 2.4, tier: 2 });
    const low = cand({ id: "low", lift: 0.2, tier: 0 });
    const mid = cand({ id: "mid", lift: 1.6, tier: 1 });
    const result = selectForAnalysis([mid, low, t2, t3, own, t4], { limit: 19 });
    expect(ids(result)).toEqual(["own1", "t4", "t3", "t2", "low", "mid"]);
  });

  it("kontrast grubu en çok 3 ve en düşük lift'lilerden; fazlası 'kalan'a düşer", () => {
    const lows = [0.1, 0.2, 0.3, 0.4].map((lift, i) => cand({ id: `l${i}`, lift, tier: 0 }));
    const result = selectForAnalysis(lows, { limit: 19 });
    expect(ids(result).slice(0, CONTRAST_LIMIT)).toEqual(["l0", "l1", "l2"]);
    expect(ids(result)).toHaveLength(4);
  });

  it("kendi videolar toplamda en çok 10 öne alınır (analizliler dahil); fazlası rakiplerden sonra", () => {
    const doneOwn = Array.from({ length: 8 }, (_, i) => cand({ id: `d${i}`, isOwn: true, lift: 1, analysisStatus: "ok" }));
    const freshOwn = Array.from({ length: 4 }, (_, i) => cand({ id: `o${i}`, isOwn: true, lift: 4 - i }));
    const t3 = cand({ id: "t3", lift: 3.5, tier: 3 });
    const result = selectForAnalysis([...doneOwn, ...freshOwn, t3], { limit: 19 });
    expect(ids(result)).toEqual(["o0", "o1", "t3", "o2", "o3"]);
  });

  it("limit uygulanır", () => {
    const rivals = Array.from({ length: 10 }, (_, i) => cand({ lift: 4 + i, tier: 3 }));
    expect(selectForAnalysis(rivals, { limit: 4 })).toHaveLength(4);
  });

  it("lift ölçülemeyen rakip tutan ya da düşük sayılmaz, sonda yer alır (undefined ≠ 0)", () => {
    const unknown = cand({ id: "u", lift: undefined, tier: undefined });
    const t3 = cand({ id: "t3", lift: 3, tier: 3 });
    const low = cand({ id: "low", lift: 0.1, tier: 0 });
    expect(ids(selectForAnalysis([unknown, low, t3], { limit: 19 }))).toEqual(["t3", "low", "u"]);
  });
});

describe("selectForAnalysis: atlama kuralları", () => {
  it("analizi ok ya da insufficient_data olan atlanır; failed yeniden denenir", () => {
    const done = cand({ id: "ok", lift: 5, tier: 4, analysisStatus: "ok" });
    const thin = cand({ id: "thin", lift: 5, tier: 4, analysisStatus: "insufficient_data" });
    const failed = cand({ id: "failed", lift: 5, tier: 4, analysisStatus: "failed" });
    const fresh = cand({ id: "fresh", lift: 4, tier: 3 });
    expect(ids(selectForAnalysis([done, thin, failed, fresh], { limit: 19 }))).toEqual(["failed", "fresh"]);
  });

  it("niş dışı rakip çıkar; elenmemiş (undefined) kalır; kendi video eleğe bakılmaz", () => {
    const off = cand({ id: "off", lift: 6, tier: 4, inNiche: false });
    const unscreened = cand({ id: "unscreened", lift: 5, tier: 4, inNiche: undefined });
    const inNiche = cand({ id: "in", lift: 4, tier: 3, inNiche: true });
    const ownOff = cand({ id: "ownOff", isOwn: true, inNiche: false });
    expect(ids(selectForAnalysis([off, unscreened, inNiche, ownOff], { limit: 19 }))).toEqual(["ownOff", "unscreened", "in"]);
  });
});

describe("pickScreeningBatch", () => {
  const screenable = (c: AnalysisCandidate) => !c.isOwn && c.inNiche === undefined;

  it("seçimde elenebilir rakip yoksa boş döner (eleme biter)", () => {
    const rivals = [cand({ lift: 5, tier: 4, inNiche: true }), cand({ lift: 4, tier: 3, inNiche: false })];
    expect(pickScreeningBatch(rivals, selectForAnalysis(rivals, { limit: 5 }), screenable, 20)).toEqual([]);
  });

  it("rakip sırasındaki ilk `window` elenebilir rakibi alır (seçim dışındakiler dahil); elenmiş olanlar atlanır", () => {
    const rivals = Array.from({ length: 8 }, (_, i) => cand({ id: `r${i}`, lift: 10 - i, tier: 3, inNiche: i === 0 ? true : undefined }));
    const selection = selectForAnalysis(rivals, { limit: 2 }); // r0 (niş içi), r1
    expect(ids(pickScreeningBatch(rivals, selection, screenable, 3))).toEqual(["r1", "r2", "r3"]);
  });

  it("pencere seçimdeki elenebilir sayısından küçük olamaz", () => {
    const rivals = Array.from({ length: 6 }, (_, i) => cand({ id: `r${i}`, lift: 10 - i, tier: 3 }));
    const selection = selectForAnalysis(rivals, { limit: 5 });
    expect(pickScreeningBatch(rivals, selection, screenable, 2)).toHaveLength(5);
  });

  it("kendi videolar elenmez", () => {
    const own = cand({ isOwn: true });
    expect(pickScreeningBatch([own], [own], screenable, 10)).toEqual([]);
  });
});

describe("selectForAnalysis: pilot", () => {
  it("1 kendi + 2 rakip: biri tutan, biri tutmayan", () => {
    const own = [cand({ id: "o1", isOwn: true, lift: 2 }), cand({ id: "o2", isOwn: true, lift: 13 })];
    const rivals = [cand({ id: "t4", lift: 9, tier: 4 }), cand({ id: "t3", lift: 3.2, tier: 3 }), cand({ id: "t2", lift: 2.2, tier: 2 })];
    const result = selectForAnalysis([...rivals, ...own], { limit: 19, pilot: true });
    expect(ids(result)).toEqual(["o2", "t4", "t2"]);
  });

  it("tutmayan rakip yoksa ikinci tutan alınır; rakip yoksa yalnız kendi", () => {
    const rivals = [cand({ id: "a", lift: 9, tier: 4 }), cand({ id: "b", lift: 4, tier: 3 })];
    expect(ids(selectForAnalysis(rivals, { limit: 19, pilot: true }))).toEqual(["a", "b"]);
    expect(ids(selectForAnalysis([cand({ id: "o", isOwn: true })], { limit: 19, pilot: true }))).toEqual(["o"]);
  });
});

describe("countSelectable (halka sayacı işle aynı kural)", () => {
  it("niş dışı rakip, analizi bitmiş içerik sayılmaz; elenmemiş rakip ve kendi video sayılır", async () => {
    const { countSelectable } = await import("@/lib/intel/analysis-select");
    const base = { handle: "h" };
    expect(
      countSelectable([
        { id: "a", isOwn: false, inNiche: false, ...base },
        { id: "b", isOwn: false, analysisStatus: "ok", ...base },
        { id: "c", isOwn: false, ...base },
        { id: "d", isOwn: true, inNiche: false, ...base },
      ]),
    ).toBe(2);
  });
});
