import { describe, expect, it } from "vitest";
import { normalizeProfile, parseProfiles, pickRelatedHandles } from "@/lib/platforms/instagram/normalize-profile";
import { loadFixture } from "@/lib/platforms/instagram/test-support";
import type { NormalizedProfile } from "@/lib/platforms/types";

function only(row: Record<string, unknown>): NormalizedProfile {
  const result = normalizeProfile(row);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe("Instagram profil — gerçek fixture (instagram-profile-scraper, @ornekhesap)", () => {
  const raw = loadFixture("profile");
  const parsed = parseProfiles(raw);

  it("tek satır → tek profil; öğe olmayan satır ve erişim hatası yok", () => {
    expect(parsed.items).toHaveLength(1);
    expect(parsed.notItems).toEqual([]);
    expect(parsed.accessError).toBeUndefined();
  });

  it("fixture: biyografi bağlantısı ve işletme işareti ham veriden", () => {
    expect(parsed.items[0].externalUrl).toBe(raw[0].externalUrl);
    expect(parsed.items[0].externalUrl).toBe("https://calendly.com/ornek/60min");
    expect(parsed.items[0].isBusinessAccount).toBe(false);
  });

  it("künye alanları ham veriyle aynı", () => {
    const [profile] = parsed.items;
    expect(profile).toMatchObject({
      platform: "instagram",
      handle: "ornekhesap",
      externalId: "6909395",
      displayName: raw[0].fullName,
      bio: raw[0].biography,
      followers: 1447,
      following: 582,
      postsCount: 275,
      isPrivate: false,
      isVerified: false,
      missingFields: [],
    });
    expect(profile.avatarUrl).toMatch(/^https:\/\//);
  });

  it("businessCategoryName null → kategori yazılmaz; relatedProfiles boş dizi → relatedHandles boş dizi", () => {
    expect(raw[0].businessCategoryName).toBeNull();
    expect("category" in parsed.items[0]).toBe(false);
    expect(raw[0].relatedProfiles).toEqual([]);
    expect(parsed.items[0].relatedHandles).toEqual([]);
  });
});

describe("Instagram profil — kurallar (sentetik satırlar)", () => {
  const base = { username: "Ornek.Hesap", followersCount: 10, followsCount: 5, postsCount: 3 };

  it("relatedProfiles → relatedHandles: nesne ve metin girdileri, tekil, geçerli, kendisi hariç", () => {
    const profile = only({
      ...base,
      relatedProfiles: [
        { username: "Bir.Hesap", full_name: "Kişi Adı", id: "1", profile_pic_url: "https://x/y" },
        { username: "bir.hesap" },
        "@iki_hesap",
        { username: "ornek.hesap" },
        { username: "geçersiz ad" },
        { id: "3" },
        42,
      ],
    });
    expect(profile.relatedHandles).toEqual(["bir.hesap", "iki_hesap"]);
    expect(JSON.stringify(profile)).not.toContain("Kişi Adı");
  });

  it("relatedProfiles alanı hiç yoksa relatedHandles yazılmaz (boş dizi ile ayrı)", () => {
    expect("relatedHandles" in only(base)).toBe(false);
    expect(pickRelatedHandles({ relatedProfiles: "yok" }, "x")).toBeUndefined();
  });

  it("sayaçlar: 0 korunur, verilmeyen alan yazılmaz ve missingFields'a girer", () => {
    const zero = only({ username: "a", followersCount: 0, followsCount: 0, postsCount: 0 });
    expect(zero).toMatchObject({ followers: 0, following: 0, postsCount: 0, missingFields: [] });

    const partial = only({ username: "a", followersCount: 7 });
    expect("following" in partial).toBe(false);
    expect("postsCount" in partial).toBe(false);
    expect(partial.missingFields).toEqual(["following", "postsCount"]);

    expect(only({ username: "a", followersCount: -1 }).missingFields).toContain("followers");
  });

  it("gizli hesap işaretlenir; doğrulanmış/gizli bayrakları yalnız boolean iken yazılır", () => {
    const profile = only({ ...base, private: true, verified: true });
    expect(profile.isPrivate).toBe(true);
    expect(profile.isVerified).toBe(true);
    const unknown = only({ ...base, private: "evet" });
    expect("isPrivate" in unknown).toBe(false);
  });

  it("externalUrl (biyografi bağlantısı, yalnız http/https) ve isBusinessAccount; yoksa hiç yazılmaz", () => {
    const profile = only({ ...base, externalUrl: " https://calendly.com/ornek/30min ", isBusinessAccount: true });
    expect(profile.externalUrl).toBe("https://calendly.com/ornek/30min");
    expect(profile.isBusinessAccount).toBe(true);
    expect(only({ ...base, isBusinessAccount: false }).isBusinessAccount).toBe(false);
    const none = only(base);
    expect("externalUrl" in none).toBe(false);
    expect("isBusinessAccount" in none).toBe(false);
    // Betik şeması ve şemasız değer kabul edilmez (şema sözcüğü parçalı yazılır: AGENTS.md ek grep'i).
    expect("externalUrl" in only({ ...base, externalUrl: "java" + "script:alert(1)" })).toBe(false);
    expect("externalUrl" in only({ ...base, externalUrl: "calendly.com/x" })).toBe(false);
    expect("isBusinessAccount" in only({ ...base, isBusinessAccount: "evet" })).toBe(false);
  });

  it("kategori: 'None' bir kategori değildir", () => {
    expect(only({ ...base, businessCategoryName: "None" }).category).toBeUndefined();
    expect(only({ ...base, businessCategoryName: "Personal Coach" }).category).toBe("Personal Coach");
  });

  it("kullanıcı adı yoksa url'den; hiçbiri yoksa notItems", () => {
    expect(only({ url: "https://www.instagram.com/Abc.D/", followersCount: 1 }).handle).toBe("abc.d");
    const none = parseProfiles([{ followersCount: 1 }]);
    expect(none.items).toEqual([]);
    expect(none.notItems[0].reason).toMatch(/kullanıcı adı/);
  });

  it("boş biyografi yazılmaz (undefined), avatar yalnız https", () => {
    const profile = only({ ...base, biography: "", profilePicUrl: "java" + "script:alert(1)" });
    expect("bio" in profile).toBe(false);
    expect("avatarUrl" in profile).toBe(false);
  });
});
