import { describe, expect, it } from "vitest";
import { getPlatformModule, hasPlatformModule } from "@/lib/platforms/registry";

describe("platform kaydı", () => {
  it("instagram modülü: herkese açık veri adaptörü tam, kendi hesap/yayın henüz yok", () => {
    const instagram = getPlatformModule("instagram");
    expect(instagram.platform).toBe("instagram");
    expect(instagram.label).toBe("Instagram");
    const adapter = instagram.publicData;
    expect(adapter.platform).toBe("instagram");
    for (const fn of ["normalizeHandle", "contentUrl", "buildProfileJob", "buildContentJob", "buildSearchJob", "parseProfiles", "parseContent", "parseSearch"] as const) {
      expect(typeof adapter[fn], fn).toBe("function");
    }
    expect(instagram.owned).toBeUndefined();
    expect(instagram.publisher).toBeUndefined();
  });

  it("adaptör sözleşme üzerinden çalışır (uçtan uca küçük duman)", () => {
    const { publicData } = getPlatformModule("instagram");
    expect(publicData.normalizeHandle("@OrnekHesap")).toBe("ornekhesap");
    const job = publicData.buildContentJob({ handle: "ornekhesap", limit: 3, includeTranscript: false });
    expect(job.actorId).toBe("apify/instagram-reel-scraper");
    expect(publicData.contentUrl({ externalId: "1", shortcode: "ABC" })).toBe("https://www.instagram.com/p/ABC/");
  });

  it("kayıtsız platform: hasPlatformModule false, getPlatformModule fırlatır", () => {
    expect(hasPlatformModule("instagram")).toBe(true);
    expect(hasPlatformModule("tiktok")).toBe(true);
    expect(hasPlatformModule("youtube")).toBe(false);
    expect(() => getPlatformModule("youtube")).toThrow(/kayıtlı değil/);
  });
});
