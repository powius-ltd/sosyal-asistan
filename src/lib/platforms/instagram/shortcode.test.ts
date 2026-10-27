import { describe, expect, it } from "vitest";

import { contentUrl } from "@/lib/platforms/instagram/content-url";
import { parseInstagramContentUrl } from "@/lib/platforms/instagram/shortcode";
import { getPlatformModule } from "@/lib/platforms/registry";

const CODE = "DdJy8QANttn";

describe("parseInstagramContentUrl", () => {
  it.each([
    [`https://www.instagram.com/reel/${CODE}/`, "reel"],
    [`https://instagram.com/reel/${CODE}`, "reel"],
    [`https://www.instagram.com/reels/${CODE}/`, "reel"],
    [`https://www.instagram.com/p/${CODE}/`, "post"],
    [`https://m.instagram.com/reel/${CODE}/`, "reel"],
    [`http://www.instagram.com/reel/${CODE}/`, "reel"],
    [`https://www.instagram.com/reel/${CODE}/?igsh=MWx4ZXQ3&utm_source=ig_web_copy_link#x`, "reel"],
    [`https://www.instagram.com/ornek.k/reel/${CODE}/`, "reel"],
    [`https://www.instagram.com/ornek.k/p/${CODE}/`, "post"],
    [`https://WWW.INSTAGRAM.COM/Reel/${CODE}/`, "reel"],
    [`  https://www.instagram.com/reel/${CODE}/  `, "reel"],
    [`instagram.com/reel/${CODE}/`, "reel"],
    [`www.instagram.com/p/${CODE}`, "post"],
  ])("%s → kısa kod + tür", (url, kind) => {
    expect(parseInstagramContentUrl(url)).toEqual({ platform: "instagram", shortcode: CODE, kind });
  });

  it("kısa kod büyük/küçük harf duyarlıdır ve - _ karakterlerini korur", () => {
    expect(parseInstagramContentUrl("https://www.instagram.com/reel/DUbIs-3iC8q/")?.shortcode).toBe("DUbIs-3iC8q");
    expect(parseInstagramContentUrl("https://www.instagram.com/reel/C_a-B_c-D12/")?.shortcode).toBe("C_a-B_c-D12");
  });

  it("contentUrl ile gidiş-dönüş: üretilen adres aynı koda çözülür", () => {
    expect(parseInstagramContentUrl(contentUrl({ externalId: "1", shortcode: CODE }))?.shortcode).toBe(CODE);
  });

  it.each([
    ["boş", ""],
    ["yalnız boşluk", "   "],
    ["metin", "bu bir link değil"],
    ["profil bağlantısı", "https://www.instagram.com/ornek.k/"],
    ["profil + reels sekmesi", "https://www.instagram.com/ornek.k/reels/"],
    ["hikaye", `https://www.instagram.com/stories/ornek.k/${CODE}/`],
    ["IGTV", `https://www.instagram.com/tv/${CODE}/`],
    ["paylaşım yönlendirmesi (kod yok)", "https://www.instagram.com/share/reel/BAhCoDEsc/"],
    ["kod sonrası fazla yol", `https://www.instagram.com/reel/${CODE}/audio/`],
    ["çok kısa kod", "https://www.instagram.com/reel/abc/"],
    ["geçersiz kod karakteri", "https://www.instagram.com/reel/abc$%^def12/"],
    ["başka alan adı", `https://www.tiktok.com/reel/${CODE}/`],
    ["alt alan adı hilesi", `https://instagram.com.kotu.net/reel/${CODE}/`],
    ["önek hilesi", `https://kotuinstagram.com/reel/${CODE}/`],
    ["kimlik bilgili adres", `https://instagram.com@kotu.net/reel/${CODE}/`],
    ["kullanıcı:parola", `https://u:p@www.instagram.com/reel/${CODE}/`],
    ["javascript şeması", `javascript:alert(1)//instagram.com/reel/${CODE}/`],
    ["ftp şeması", `ftp://www.instagram.com/reel/${CODE}/`],
    ["data şeması", "data:text/html,<script>alert(1)</script>"],
    ["kısaltma alan adı", `https://instagr.am/reel/${CODE}/`],
    ["şemasız başka alan adı", `kotu.net/instagram.com/reel/${CODE}/`],
    ["çok uzun girdi", `https://www.instagram.com/reel/${"a".repeat(600)}/`],
    ["içinde boşluk", `https://www.instagram.com/reel/${CODE}/ ve metin`],
  ])("reddedilir: %s", (_label, url) => {
    expect(parseInstagramContentUrl(url)).toBeUndefined();
  });
});

describe("PlatformModule.parseContentUrl", () => {
  it("Instagram modülü bağlantıyı kısa koda çevirir (UI platforma dallanmaz)", () => {
    expect(getPlatformModule("instagram").parseContentUrl(`https://www.instagram.com/reel/${CODE}/`)).toEqual({
      platform: "instagram",
      shortcode: CODE,
      kind: "reel",
    });
    expect(getPlatformModule("instagram").parseContentUrl("https://example.com/x")).toBeUndefined();
  });
});
