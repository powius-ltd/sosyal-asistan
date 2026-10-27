import { describe, expect, it } from "vitest";
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import { parseSearch } from "@/lib/platforms/instagram/normalize-search";
import { loadFixture } from "@/lib/platforms/instagram/test-support";

describe("Instagram arama — gerçek fixture (instagram-search-scraper, 'life coach women')", () => {
  const raw = loadFixture("search");
  const parsed = parseSearch(raw);

  it("10 satırın 10'u aday; source=search, via=sorgu, geçerli kullanıcı adı, takipçi sayısı ham veriyle aynı", () => {
    expect(raw).toHaveLength(10);
    expect(parsed.items).toHaveLength(10);
    expect(parsed.notItems).toEqual([]);
    expect(parsed.accessError).toBeUndefined();
    for (const [i, candidate] of parsed.items.entries()) {
      expect(candidate.platform).toBe("instagram");
      expect(candidate.source).toBe("search");
      expect(candidate.via).toBe("life coach women");
      expect(candidate.handle).toMatch(HANDLE_PATTERN);
      expect(candidate.followers).toBe(raw[i].followersCount);
    }
  });

  it("aday yalnız platform/kullanıcı adı/takipçi/kaynak/sorgu taşır (biyografi, sayfa, görsel yok)", () => {
    for (const candidate of parsed.items) {
      expect(Object.keys(candidate).sort()).toEqual(["followers", "handle", "platform", "source", "via"]);
    }
  });
});

describe("Instagram arama — kurallar (sentetik satırlar)", () => {
  it("gizli hesap ve tekrar eden hesap aday olmaz; sebebiyle notItems'a düşer", () => {
    const parsed = parseSearch([
      { username: "Acik.Hesap", followersCount: 5, searchTerm: "q" },
      { username: "gizli.hesap", followersCount: 9, private: true, searchTerm: "q" },
      { username: "acik.hesap", followersCount: 5, searchTerm: "q" },
      { followersCount: 1 },
    ]);
    expect(parsed.items).toEqual([{ platform: "instagram", handle: "acik.hesap", followers: 5, source: "search", via: "q" }]);
    expect(parsed.notItems.map((n) => n.reason)).toEqual([
      "hesap gizli, aday olamaz (@gizli.hesap)",
      "aynı hesap tekrar geldi (@acik.hesap)",
      "profilde geçerli kullanıcı adı yok",
    ]);
    expect(parsed.accessError).toBeUndefined();
  });

  it("takipçi sayısı verilmezse followers yazılmaz (0 değil)", () => {
    const [candidate] = parseSearch([{ username: "x" }]).items;
    expect("followers" in candidate).toBe(false);
    expect("via" in candidate).toBe(false);
  });
});
