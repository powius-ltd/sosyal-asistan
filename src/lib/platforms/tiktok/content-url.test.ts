import { describe, expect, it } from "vitest";

import { contentUrl, parseTikTokContentUrl, tiktokEmbedUrl } from "@/lib/platforms/tiktok/content-url";

const ID = "7500000000000000001";

describe("parseTikTokContentUrl", () => {
  it.each([
    [`https://www.tiktok.com/@ornek.hesap/video/${ID}`, "video"],
    [`https://www.tiktok.com/@ornek.hesap/video/${ID}?is_from_webapp=1&sender_device=pc#x`, "video"],
    [`tiktok.com/@ornek.hesap/video/${ID}/`, "video"],
    [`http://m.tiktok.com/@ornek.hesap/video/${ID}`, "video"],
    [`https://www.tiktok.com/@/video/${ID}`, "video"],
    [`https://www.tiktok.com/@ornek.hesap/photo/${ID}`, "post"],
  ])("%s → kimlik", (url, kind) => {
    expect(parseTikTokContentUrl(url)).toEqual({ platform: "tiktok", shortcode: ID, kind });
  });

  it.each([
    "",
    "merhaba",
    `https://www.tiktok.com/@ornek.hesap`,
    `https://www.tiktok.com/@ornek.hesap/video/abc`,
    `https://www.tiktok.com/@ornek.hesap/video/${ID}/analytics`,
    `https://www.tiktok.com/ornek.hesap/video/${ID}`,
    `https://www.tiktok.com/tag/kahve`,
    "https://vm.tiktok.com/ZMabcdef/",
    "https://www.tiktok.com/t/ZTabcdef/",
    `https://www.tiktok.com.kotu.net/@a/video/${ID}`,
    `https://kullanici:parola@www.tiktok.com/@a/video/${ID}`,
    `javascript:alert(1)//www.tiktok.com/@a/video/${ID}`,
    `ftp://www.tiktok.com/@a/video/${ID}`,
    "https://www.instagram.com/reel/DAbCdEfGhIj/",
    `https://www.tiktok.com/@a/video/${ID} ek`,
    `https://www.tiktok.com/@a/video/${ID}?${"x".repeat(500)}`,
  ])("kabul edilmeyen bağlantı (%s) → undefined", (url) => {
    expect(parseTikTokContentUrl(url)).toBeUndefined();
  });
});

describe("contentUrl", () => {
  it("kimlikten bağlantı kurar ve ters yönde aynı kimliğe çözülür", () => {
    const url = contentUrl({ externalId: ID });
    expect(url).toBe(`https://www.tiktok.com/@/video/${ID}`);
    expect(parseTikTokContentUrl(`${url}?igsh=abc`)?.shortcode).toBe(ID);
    expect(contentUrl({ externalId: "baska", shortcode: ID })).toBe(url);
  });

  it("sayısal olmayan kimlikte fırlatır", () => {
    expect(() => contentUrl({ externalId: "abc" })).toThrow(/sayısal video kimliği/);
  });
});

describe("tiktokEmbedUrl", () => {
  it("kalıcı bağlantıdan resmi oynatıcı adresi", () => {
    expect(tiktokEmbedUrl(`https://www.tiktok.com/@ornek.hesap/video/${ID}?lang=tr`)).toBe(`https://www.tiktok.com/player/v1/${ID}`);
  });

  it.each([
    undefined,
    "",
    "javascript:alert(1)",
    `http://www.tiktok.com/@a/video/${ID}`,
    `https://www.tiktok.com/@a/photo/${ID}`,
    `https://evil.example/@a/video/${ID}`,
    "https://v19-webapp.tiktok.com/video/tos/abc.mp4",
    "https://vm.tiktok.com/ZMabcdef/",
  ])("gömülemeyen adres (%s) → undefined", (url) => {
    expect(tiktokEmbedUrl(url)).toBeUndefined();
  });
});
