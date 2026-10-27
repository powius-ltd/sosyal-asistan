import { describe, expect, it } from "vitest";
import { contentUrl, shortcodeFromMediaId } from "@/lib/platforms/instagram/content-url";
import { loadFixture } from "@/lib/platforms/instagram/test-support";

describe("Instagram contentUrl", () => {
  it("kısa kod varsa onu kullanır", () => {
    expect(contentUrl({ externalId: "1", shortcode: "DdJy8QANttn" })).toBe("https://www.instagram.com/p/DdJy8QANttn/");
  });

  it("kısa kod yoksa sayısal medya kimliğinden türetir", () => {
    expect(shortcodeFromMediaId("3983939388063538023")).toBe("DdJy8QANttn");
    expect(shortcodeFromMediaId("3826690583914098474")).toBe("DUbIs-3iC8q");
    expect(contentUrl({ externalId: "3983939388063538023" })).toBe("https://www.instagram.com/p/DdJy8QANttn/");
  });

  it("gerçek fixture: her reel için türetilen kod aktörün verdiği kısa koda eşit", () => {
    for (const row of loadFixture("reel")) {
      expect(shortcodeFromMediaId(String(row.id)), String(row.shortCode)).toBe(row.shortCode);
    }
  });

  it("'medya_kullanıcı' biçiminde yalnız medya kısmı kullanılır", () => {
    expect(shortcodeFromMediaId("3983939388063538023_6909395")).toBe("DdJy8QANttn");
  });

  it("türetilemeyen kimlikte undefined; contentUrl hata fırlatır", () => {
    expect(shortcodeFromMediaId("abc")).toBeUndefined();
    expect(shortcodeFromMediaId("")).toBeUndefined();
    expect(() => contentUrl({ externalId: "abc" })).toThrow(/kısa kod/);
  });
});
