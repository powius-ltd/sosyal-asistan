import { describe, expect, it } from "vitest";

import { rankCandidates, type CandidateScreenInfo, type RankableCandidate } from "@/lib/collection/candidate-rank";

const c = (id: string, followers?: number): RankableCandidate => ({ id, handle: id, ...(followers === undefined ? {} : { followers }) });
const ctx = (screens: Record<string, CandidateScreenInfo["fit"]> = {}, liftStats: Record<string, { videos: number; hits: number }> = {}, ownFollowers: number | undefined = 1000) => ({
  ownFollowers,
  screens: new Map(Object.entries(screens).map(([id, fit]) => [id, { fit }])),
  liftStats: new Map(Object.entries(liftStats)),
});
const ids = (ranked: { candidate: RankableCandidate }[]) => ranked.map((r) => r.candidate.id);

describe("rankCandidates", () => {
  it("boyut dışı aday elenmez, normal adayların arkasına düşer", () => {
    const out = rankCandidates([c("buyuk", 900_000), c("esit", 1200), c("kucuk", 100)], ctx({ buyuk: "fit", esit: "fit", kucuk: "fit" }));
    expect(ids(out)).toEqual(["esit", "buyuk", "kucuk"]);
    expect(out.map((r) => r.size)).toEqual(["in_range", "out_of_range", "out_of_range"]);
    expect(out[1].recommended).toBe(false);
  });

  it("sınırlar dahil: 0,3x ve 10x boyut içi", () => {
    const out = rankCandidates([c("alt", 300), c("ust", 10_000)], ctx());
    expect(out.map((r) => r.size)).toEqual(["in_range", "in_range"]);
  });

  it("takipçi bilinmiyorsa nötr (boyut dışı sayılmaz, 0 değil); kendi takipçi bilinmiyorsa herkes nötr", () => {
    const unknown = rankCandidates([c("a"), c("b", 5)], ctx({ a: "fit", b: "fit" }));
    expect(unknown.find((r) => r.candidate.id === "a")?.size).toBe("unknown");
    expect(unknown.find((r) => r.candidate.id === "a")?.reasons.join(" ")).toContain("bilinmiyor");
    const noOwn = rankCandidates([c("a", 5), c("b", 9_000_000)], { ...ctx(), ownFollowers: undefined });
    expect(noOwn.every((r) => r.size === "unknown")).toBe(true);
    expect(noOwn[0].reasons.join(" ")).toContain("kendi takipçi sayın bilinmiyor");
  });

  it("niş dışı (off) boyutu uygun olsa da en sona düşer", () => {
    const out = rankCandidates([c("off", 1000), c("buyuk", 900_000), c("ok", 1000)], ctx({ off: "off", buyuk: "fit", ok: "fit" }));
    expect(ids(out)).toEqual(["ok", "buyuk", "off"]);
    expect(out[2].recommended).toBe(false);
  });

  it("niş uyumu: fit > elenmemiş/unsure > off; tutan oranı yüksek olan öne geçer", () => {
    const out = rankCandidates([c("unsure", 1000), c("fit", 1000), c("fit-tutan", 1000)], ctx({ unsure: "unsure", fit: "fit", "fit-tutan": "fit" }, { "fit-tutan": { videos: 10, hits: 5 }, fit: { videos: 10, hits: 2 } }));
    expect(ids(out)).toEqual(["fit-tutan", "fit", "unsure"]);
    expect(out[0].hitRate).toBe(0.5);
  });

  it("video yoksa tutan oranı yok (undefined, 0 değil) ve nötr çarpan alır", () => {
    const out = rankCandidates([c("a", 1000), c("b", 1000)], ctx({}, { b: { videos: 0, hits: 0 } }));
    expect(out[0].hitRate).toBeUndefined();
    expect(out[0].score).toBe(out[1].score);
  });

  it("eşit puanda girdi (kaynak) sırası korunur", () => {
    const out = rankCandidates([c("z", 1000), c("a", 1000), c("m", 1000)], ctx());
    expect(ids(out)).toEqual(["z", "a", "m"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ilk 5 önerilir; nedenler jargon içermez", () => {
    const list = Array.from({ length: 7 }, (_, i) => c(`c${i}`, 1000));
    const out = rankCandidates(list, ctx(Object.fromEntries(list.map((x) => [x.id, "fit" as const]))));
    expect(out.filter((r) => r.recommended)).toHaveLength(5);
    const text = out.flatMap((r) => r.reasons).join(" ").toLowerCase();
    expect(text).not.toMatch(/lift|baz çizgisi|kademe|medyan|hook/);
  });
});
