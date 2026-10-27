import { describe, expect, it } from "vitest";

import { rankCoauthors, searchQueriesOf, selectNewCandidates, similarSizeCount, type HandleNormalizer } from "@/lib/collection/discover-candidates";
import type { DiscoveryCandidate } from "@/lib/platforms/types";

const normalize: HandleNormalizer = (platform, raw) => (platform === "instagram" ? raw.trim().replace(/^@+/, "").toLowerCase() || undefined : undefined);
const own = [{ platform: "instagram" as const, handle: "kendi.hesap" }];
const candidate = (handle: string, extra: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({ platform: "instagram", handle, source: "related", ...extra });

describe("selectNewCandidates (aday kuralı)", () => {
  it("kendi hesap, kayıtlı rakip (her durumda), tekrar ve geçersiz ad elenir; ad normalize edilir", () => {
    const { fresh, skipped } = selectNewCandidates({
      candidates: [candidate("@Yeni.Aday"), candidate("kendi.hesap"), candidate("izlenen"), candidate("yoksayilan"), candidate("yeni.aday"), candidate("bozuk ad!"), candidate("")],
      own,
      known: [
        { platform: "instagram", handle: "izlenen" },
        { platform: "instagram", handle: "yoksayilan" },
      ],
      normalize,
    });
    expect(fresh).toEqual([{ platform: "instagram", handle: "yeni.aday", source: "related" }]);
    expect(skipped).toEqual({ invalid: 2, own: 1, known: 2, otherPlatform: 0, duplicate: 1, overLimit: 0 });
  });

  it("aday kendi hesapla AYNI platformdan olmalı; kendi hesap yoksa hiçbir aday yazılmaz", () => {
    const other = selectNewCandidates({ candidates: [candidate("baska", { platform: "tiktok" }), candidate("ayni")], own, known: [], normalize });
    expect(other.fresh.map((c) => c.handle)).toEqual(["ayni"]);
    expect(other.skipped.otherPlatform).toBe(1);
    expect(selectNewCandidates({ candidates: [candidate("ayni")], own: [], known: [], normalize }).fresh).toEqual([]);
  });

  it("sınır aşılınca fazlası yazılmaz; takipçi yalnız ölçüldüyse taşınır (0 korunur, bilinmeyen yok)", () => {
    const { fresh, skipped } = selectNewCandidates({
      candidates: [candidate("a1", { followers: 0 }), candidate("a2", { followers: 1200.9, via: "  sorgu  " }), candidate("a3", { followers: Number.NaN }), candidate("a4")],
      own,
      known: [],
      normalize,
      limit: 3,
    });
    expect(fresh).toEqual([
      { platform: "instagram", handle: "a1", source: "related", followers: 0 },
      { platform: "instagram", handle: "a2", source: "related", followers: 1200, via: "sorgu" },
      { platform: "instagram", handle: "a3", source: "related" },
    ]);
    expect(skipped.overLimit).toBe(1);
  });

  it("yalnız sözleşmedeki alanlar taşınır: ham satırdan gelen fazladan alan adaya sızmaz", () => {
    const dirty = { ...candidate("temiz"), fullName: "Tam Ad", profilePicUrl: "https://ornek.test/a.jpg", latestComments: [{ ownerUsername: "yorumcu" }] } as DiscoveryCandidate;
    const [only] = selectNewCandidates({ candidates: [dirty], own, known: [], normalize }).fresh;
    expect(Object.keys(only).sort()).toEqual(["handle", "platform", "source"]);
  });
});

describe("kaynak yardımcıları", () => {
  it("rankCoauthors: en sık birlikte paylaşılan önce, eşitlikte alfabetik; aynı içerikte tekrar bir sayılır", () => {
    expect(rankCoauthors([["B.hesap", "a.hesap"], ["b.hesap", "b.hesap"], ["@c.hesap"], []], 2)).toEqual(["b.hesap", "a.hesap"]);
  });

  it("searchQueriesOf: konu söyleyen en sık etiketler; genel etiket, çok kısa ve sayısal etiket sorgu olmaz", () => {
    const tags = [["#Reels", "yogadersi", "kesfet"], ["yogadersi", "nefes", "2026"], ["nefescalismasi", "fyp", "abc"], ["nefescalismasi"]];
    expect(searchQueriesOf(tags, 2)).toEqual(["nefescalismasi", "yogadersi"]);
    expect(searchQueriesOf([["reels", "kesfet"]])).toEqual([]);
  });

  it("similarSizeCount: ±3 kat içindeki aday sayısı; hiçbiri ölçülemediyse undefined (0 değil)", () => {
    const accounts = [{ id: "o", platform: "instagram" as const, handle: "kendi", followers: 1000 }];
    expect(similarSizeCount(accounts, [{ platform: "instagram", followers: 3000 }, { platform: "instagram", followers: 3001 }, { platform: "instagram" }])).toBe(1);
    expect(similarSizeCount(accounts, [{ platform: "instagram", followers: 90_000 }])).toBe(0);
    expect(similarSizeCount(accounts, [{ platform: "instagram" }])).toBeUndefined();
    expect(similarSizeCount([{ ...accounts[0], followers: undefined }], [{ platform: "instagram", followers: 500 }])).toBeUndefined();
    expect(similarSizeCount(accounts, [])).toBeUndefined();
  });
});
