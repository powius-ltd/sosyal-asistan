import { describe, expect, it } from "vitest";

import { isOwnHandle, normalizeHandle, parseHandle } from "@/components/competitors/handle";

describe("parseHandle", () => {
  it("@ işaretini atar ve küçük harfe çevirir", () => {
    expect(parseHandle("@Kahve.Yeri")).toEqual({ ok: true, handle: "kahve.yeri" });
    expect(parseHandle("  @@Demlik_Ist  ")).toEqual({ ok: true, handle: "demlik_ist" });
  });

  it("çıplak kullanıcı adını olduğu gibi kabul eder", () => {
    expect(parseHandle("kahvecininyeri")).toEqual({ ok: true, handle: "kahvecininyeri" });
  });

  it("Instagram profil URL'sinden handle ayıklar (sorgu, eğik çizgi, www)", () => {
    expect(parseHandle("https://www.instagram.com/Kahve.Yeri/?hl=tr")).toEqual({ ok: true, handle: "kahve.yeri" });
    expect(parseHandle("instagram.com/demlik_ist")).toEqual({ ok: true, handle: "demlik_ist" });
    expect(parseHandle("http://instagram.com/demlik_ist#top")).toEqual({ ok: true, handle: "demlik_ist" });
  });

  it("TikTok/YouTube profil bağlantılarında @ ön ekini ister", () => {
    expect(parseHandle("https://www.tiktok.com/@Kahve.Yeri?lang=tr")).toEqual({ ok: true, handle: "kahve.yeri" });
    expect(parseHandle("https://www.youtube.com/@KahveYeri")).toEqual({ ok: true, handle: "kahveyeri" });
    expect(parseHandle("https://www.youtube.com/watch?v=abc")).toEqual({ ok: false, reason: "not_profile_url" });
  });

  it("profil olmayan bağlantıyı reddeder", () => {
    expect(parseHandle("https://www.instagram.com/p/C1abcDEF/")).toEqual({ ok: false, reason: "not_profile_url" });
    expect(parseHandle("https://www.instagram.com/reel/C1abcDEF/")).toEqual({ ok: false, reason: "not_profile_url" });
    expect(parseHandle("https://www.instagram.com/")).toEqual({ ok: false, reason: "not_profile_url" });
  });

  it("boş ve geçersiz girdiyi reddeder", () => {
    expect(parseHandle("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseHandle("kahve yeri")).toEqual({ ok: false, reason: "invalid" });
    expect(parseHandle("kahve/yeri")).toEqual({ ok: false, reason: "invalid" });
    expect(parseHandle("kahvecı")).toEqual({ ok: false, reason: "invalid" });
    expect(parseHandle("a".repeat(51))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("parseHandle (platform verilince modülün kendi kuralı)", () => {
  it("Instagram: 30 karakter kabul, 31 ret", () => {
    expect(parseHandle("a".repeat(30), "instagram")).toEqual({ ok: true, handle: "a".repeat(30) });
    expect(parseHandle("a".repeat(40), "instagram")).toEqual({ ok: false, reason: "invalid" });
  });

  it("TikTok: 2–24 karakter", () => {
    expect(parseHandle("a", "tiktok")).toEqual({ ok: false, reason: "invalid" });
    expect(parseHandle("ab", "tiktok")).toEqual({ ok: true, handle: "ab" });
    expect(parseHandle("a".repeat(25), "tiktok")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("normalizeHandle", () => {
  it("geçerliyse handle, değilse boş dizge döner", () => {
    expect(normalizeHandle("@Kahve.Yeri")).toBe("kahve.yeri");
    expect(normalizeHandle("kahve yeri")).toBe("");
  });
});

describe("isOwnHandle (D3-17)", () => {
  const own = [{ platform: "instagram", handle: "Benim.Hesap" }] as const;

  it("aynı platform + aynı kullanıcı adı (büyük harf ve @ ayrımsız) kendi hesaptır", () => {
    expect(isOwnHandle(own, "instagram", "@benim.hesap")).toBe(true);
    expect(isOwnHandle(own, "instagram", "benim.hesap")).toBe(true);
  });

  it("başka platform ya da başka ad kendi hesap değildir", () => {
    expect(isOwnHandle(own, "tiktok", "benim.hesap")).toBe(false);
    expect(isOwnHandle(own, "instagram", "rakip")).toBe(false);
    expect(isOwnHandle([], "instagram", "benim.hesap")).toBe(false);
  });
});
