import { describe, expect, it } from "vitest";

import { normalizeHandle } from "@/lib/platforms/tiktok/handle";

describe("TikTok normalizeHandle", () => {
  it.each([
    ["@Kahve.Yeri", "kahve.yeri"],
    ["  @@Demlik_Ist  ", "demlik_ist"],
    ["KAHVE_YERI", "kahve_yeri"],
    ["ab", "ab"],
    ["a".repeat(24), "a".repeat(24)],
    ["kahve.yeri/", "kahve.yeri"],
  ])("kullanıcı adı %s → %s", (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });

  it.each([
    ["https://www.tiktok.com/@Kahve.Yeri?lang=tr", "kahve.yeri"],
    ["tiktok.com/@demlik_ist", "demlik_ist"],
    ["http://m.tiktok.com/@demlik_ist/#top", "demlik_ist"],
    ["https://www.tiktok.com/%40kahve.yeri", "kahve.yeri"],
  ])("profil bağlantısı %s → %s", (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "a", // 1 karakter
    "a".repeat(25), // 25 karakter
    "kahve.", // nokta sonda olamaz
    "kahve-yeri", // tire TikTok'ta yok
    "kahve yeri",
    "kahvecı",
    "kahve/yeri",
    "https://www.tiktok.com/@kahve.yeri/video/7500000000000000001", // içerik bağlantısı
    "https://www.tiktok.com/kahve.yeri", // `@` yok: profil değil
    "https://www.tiktok.com/discover/kahve",
    "https://www.tiktok.com/",
    "https://vm.tiktok.com/ZMabcdef/", // kısa paylaşım bağlantısı kullanıcı adı taşımaz
    "https://www.tiktok.com.kotu.net/@kahve",
    "https://www.instagram.com/kahve.yeri/",
    "https://www.youtube.com/@kahveyeri",
  ])("geçersiz girdi (%s) → boş", (raw) => {
    expect(normalizeHandle(raw)).toBe("");
  });

  it("metin olmayan girdi boş döner", () => {
    expect(normalizeHandle(undefined as unknown as string)).toBe("");
  });
});
