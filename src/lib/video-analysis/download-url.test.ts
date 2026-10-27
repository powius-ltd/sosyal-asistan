import { describe, expect, it } from "vitest";

import { assertDownloadableUrl, isAllowedCdnHost, parseOeExpiry } from "@/lib/video-analysis/download-url";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { cdnUrl, NOW } from "@/lib/video-analysis/test-support";

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof VideoAnalysisError ? error.kind : "başka-hata";
  }
  return undefined;
}

describe("isAllowedCdnHost (tam sonek eşleşmesi)", () => {
  it.each([
    "scontent-abc1-1.cdninstagram.com",
    "instagram.fxyz1-1.fna.fbcdn.net",
    "video.fbcdn.net",
    "SCONTENT.CDNINSTAGRAM.COM", // büyük/küçük harf duyarsız
  ])("izinli: %s", (host) => {
    expect(isAllowedCdnHost(host)).toBe(true);
  });

  it.each([
    "evil.cdninstagram.com.attacker.com", // sonek numarası
    "cdninstagram.com.evil.com",
    "notcdninstagram.com", // nokta sınırı yok
    "evilfbcdn.net",
    "fbcdn.net.evil.io",
    "cdninstagram.com", // yalnız alt alan adları (apeks video sunmaz)
    "fbcdn.net",
    "x.cdninstagram.com.", // sondaki nokta
    "instagram.com",
    "localhost",
    "127.0.0.1",
    "",
  ])("reddedilir: %s", (host) => {
    expect(isAllowedCdnHost(host)).toBe(false);
  });
});

describe("assertDownloadableUrl", () => {
  it("izinli https adresini URL olarak döndürür", () => {
    const url = assertDownloadableUrl(cdnUrl(), NOW);
    expect(url.hostname).toBe("scontent-abc1-1.cdninstagram.com");
  });

  it("saldırgan alan adını reddeder: evil.cdninstagram.com.attacker.com", () => {
    expect(kindOf(() => assertDownloadableUrl("https://evil.cdninstagram.com.attacker.com/v/clip.mp4", NOW))).toBe("invalid_url");
    expect(kindOf(() => assertDownloadableUrl("https://attacker.com/?x=.cdninstagram.com", NOW))).toBe("invalid_url");
    expect(kindOf(() => assertDownloadableUrl("https://attacker.com/#.cdninstagram.com", NOW))).toBe("invalid_url");
  });

  it("kimlik bilgisi tuzağını (x.cdninstagram.com@evil.com) reddeder", () => {
    expect(kindOf(() => assertDownloadableUrl("https://x.cdninstagram.com@evil.com/clip.mp4", NOW))).toBe("invalid_url");
    expect(kindOf(() => assertDownloadableUrl("https://user:pw@x.cdninstagram.com/clip.mp4", NOW))).toBe("invalid_url");
  });

  it.each(["http://x.cdninstagram.com/clip.mp4", "ftp://x.cdninstagram.com/clip.mp4", "javascript:alert(1)", "file:///C:/Windows/win.ini", "data:video/mp4;base64,AAAA"])(
    "https dışı şemayı reddeder: %s",
    (raw) => {
      expect(kindOf(() => assertDownloadableUrl(raw, NOW))).toBe("invalid_url");
    },
  );

  it("özel bağlantı noktasını reddeder, 443'e izin verir", () => {
    expect(kindOf(() => assertDownloadableUrl("https://x.cdninstagram.com:8443/clip.mp4", NOW))).toBe("invalid_url");
    expect(kindOf(() => assertDownloadableUrl("https://x.cdninstagram.com:443/clip.mp4", NOW))).toBeUndefined();
  });

  it("çözülemeyen adres → invalid_url; hata iletisi adresi içermez", () => {
    expect(kindOf(() => assertDownloadableUrl("bu bir adres değil", NOW))).toBe("invalid_url");
    try {
      assertDownloadableUrl("https://evil.example.com/clip.mp4?oh=secret-token", NOW);
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-token");
    }
  });

  it("göreli yönlendirme adresini taban adrese göre çözer ve yine denetler", () => {
    const base = new URL(cdnUrl());
    expect(assertDownloadableUrl("/v/other.mp4", NOW, base).hostname).toBe(base.hostname);
    expect(kindOf(() => assertDownloadableUrl("//evil.com/x.mp4", NOW, base))).toBe("invalid_url");
  });

  it("oe geçmişteyse expired_url; gelecekteyse ya da yoksa geçer", () => {
    expect(kindOf(() => assertDownloadableUrl(cdnUrl(-1), NOW))).toBe("expired_url");
    expect(kindOf(() => assertDownloadableUrl(cdnUrl(-86_400), NOW))).toBe("expired_url");
    expect(kindOf(() => assertDownloadableUrl(cdnUrl(+60), NOW))).toBeUndefined();
    expect(kindOf(() => assertDownloadableUrl("https://x.cdninstagram.com/clip.mp4", NOW))).toBeUndefined();
  });

  it("süresi dolmuş iletisi oe bilgisini verir ama belirteci sızdırmaz", () => {
    try {
      assertDownloadableUrl(cdnUrl(-5), NOW);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("süresi dolmuş");
      expect((error as Error).message).not.toContain("secret-token");
    }
  });
});

describe("parseOeExpiry", () => {
  it("onaltılık unix saniyesini okur", () => {
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a?oe=6A1B2C3D"))?.getTime()).toBe(0x6a1b2c3d * 1000);
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a?oe=6a1b2c3d"))?.getTime()).toBe(0x6a1b2c3d * 1000);
  });

  it("yok ya da okunamıyorsa undefined (bilinmiyor ≠ geçmiş)", () => {
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a"))).toBeUndefined();
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a?oe=zzzz"))).toBeUndefined();
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a?oe="))).toBeUndefined();
    expect(parseOeExpiry(new URL("https://x.cdninstagram.com/a?oe=123456789"))).toBeUndefined(); // 9 hane
  });
});
