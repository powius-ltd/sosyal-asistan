import { describe, expect, it } from "vitest";
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";

describe("Instagram normalizeHandle", () => {
  it.each([
    ["ornekhesap", "ornekhesap"],
    ["@OrnekHesap", "ornekhesap"],
    ["  @Kahve.Yeri  ", "kahve.yeri"],
    ["@@çift_at", ""], // ç geçersiz karakter
    ["@@cift_at", "cift_at"],
    ["BÜYÜK", ""],
    ["BUYUK_HARF", "buyuk_harf"],
    ["ornek/", "ornek"],
    ["brand.com", "brand.com"], // noktalı ad, alan adı DEĞİL
    ["tiktok.com", "tiktok.com"],
    ["a-b", "a-b"],
  ])("kullanıcı adı %j → %j", (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });

  it.each([
    ["https://www.instagram.com/Kahve.Yeri/", "kahve.yeri"],
    ["https://www.instagram.com/kahve.yeri/?hl=tr&igsh=abc", "kahve.yeri"],
    ["http://instagram.com/kahve", "kahve"],
    ["instagram.com/kahve", "kahve"],
    ["www.instagram.com/KAHVE/reels/", "kahve"],
    ["https://m.instagram.com/kahve#top", "kahve"],
    ["https://instagr.am/kahve", "kahve"],
    ["https://www.instagram.com/k%C3%A4hve/", ""], // decode sonrası geçersiz karakter
  ])("profil bağlantısı %j → %j", (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "https://www.instagram.com/",
    "https://www.instagram.com/p/DdJy8QANttn/",
    "https://www.instagram.com/reel/DdJy8QANttn/",
    "https://www.instagram.com/reels/DdJy8QANttn/",
    "https://www.instagram.com/explore/tags/kahve/",
    "https://www.instagram.com/stories/kahve/123/",
    "https://l.instagram.com/?u=https%3A%2F%2Fexample.com",
    "https://www.tiktok.com/@kahve",
    "tiktok.com/@kahve",
    "https://www.youtube.com/@kahve",
    "https://example.com/kahve",
    "iki kelime",
    "kahve?x=1",
    "a".repeat(31),
    "a".repeat(51),
  ])("geçersiz girdi %j → boş dizge", (raw) => {
    expect(normalizeHandle(raw)).toBe("");
  });

  it("30 karakter kabul, 31 karakter ret (Instagram'ın sınırı)", () => {
    expect(normalizeHandle("a".repeat(30))).toBe("a".repeat(30));
    expect(normalizeHandle(`https://instagram.com/${"b".repeat(31)}/`)).toBe("");
  });

  it("boş olmayan her sonuç HANDLE_PATTERN'e uyar", () => {
    for (const raw of ["@X.Y_z-1", "https://instagram.com/Abc_123/", "a"]) {
      expect(normalizeHandle(raw)).toMatch(HANDLE_PATTERN);
    }
  });

  it("metin olmayan girdide fırlatmaz", () => {
    expect(normalizeHandle(undefined as unknown as string)).toBe("");
    expect(normalizeHandle(42 as unknown as string)).toBe("");
  });
});
