import { describe, expect, it } from "vitest";
import { readAccessError } from "@/lib/platforms/instagram/access-error";
import { parseContent } from "@/lib/platforms/instagram/normalize-content";
import { parseProfiles } from "@/lib/platforms/instagram/normalize-profile";
import { parseSearch } from "@/lib/platforms/instagram/normalize-search";
import { loadFixture, reelRow } from "@/lib/platforms/instagram/test-support";

describe("Instagram erişim hataları", () => {
  it("gerçek hata satırı (bulunamayan hesap) → not_found; içerik/profil/arama üçünde de aynı", () => {
    const rows = loadFixture("access-not-found");
    for (const parsed of [parseContent(rows), parseProfiles(rows), parseSearch(rows)]) {
      expect(parsed.items).toEqual([]);
      expect(parsed.accessError).toBe("not_found");
      expect(parsed.notItems).toEqual([{ reason: "not_found — Post does not exist (@ornek.bulunmayan)" }]);
    }
  });

  it.each([
    ["restricted_page", "Restricted access", "private"],
    ["private_account", "", "private"],
    ["no_items", "Empty or private profile data", "not_found"],
    ["not_found", "", "not_found"],
    ["empty_dataset", "", "not_found"],
    ["weird_code", "This account is private", "private"],
    ["weird_code", "User not found", "not_found"],
    ["weird_code", "boom", "weird_code"],
  ])("kod %j / açıklama %j → %j", (error, errorDescription, expected) => {
    expect(readAccessError([{ error, errorDescription }])).toBe(expected);
  });

  it("hata satırı yoksa undefined", () => {
    expect(readAccessError([{ id: "1" }, null, "x"])).toBeUndefined();
    expect(readAccessError([])).toBeUndefined();
  });

  it("gizli hesap: içerik sonucu tümüyle boş → accessError=private", () => {
    const parsed = parseContent([{ url: "https://www.instagram.com/x/", username: "x", error: "restricted_page", errorDescription: "Restricted access" }]);
    expect(parsed).toEqual({
      items: [],
      notItems: [{ reason: "restricted_page — Restricted access (@x)" }],
      accessError: "private",
    });
  });

  it("boş veri kümesi hata değildir: öğe de erişim hatası da yok", () => {
    expect(parseContent([])).toEqual({ items: [], notItems: [] });
    expect(parseProfiles([])).toEqual({ items: [], notItems: [] });
    expect(parseSearch([])).toEqual({ items: [], notItems: [] });
  });

  it("toplu işte kısmi hata: gelen içerikler korunur, accessError bildirilmez, sebep notItems'ta", () => {
    const parsed = parseContent([reelRow(), { error: "not_found", errorDescription: "gone", username: "silinmis" }]);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.accessError).toBeUndefined();
    expect(parsed.notItems).toEqual([{ reason: "not_found — gone (@silinmis)" }]);
  });

  it("boş sonuç zarfı (results: []) öğe sayılmaz", () => {
    const parsed = parseContent([{ pageInfo: {}, results: [], totalCount: 0 }]);
    expect(parsed.items).toEqual([]);
    expect(parsed.notItems).toHaveLength(1);
  });
});
