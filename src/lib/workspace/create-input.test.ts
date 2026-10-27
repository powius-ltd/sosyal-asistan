import { describe, expect, it } from "vitest";

import { createWorkspaceSchema, slugBase } from "@/lib/workspace/create-input";

const valid = { name: "Kahve Dükkanı", handle: "kahve.dukkani" };

describe("createWorkspaceSchema", () => {
  it("yalnız ad + kullanıcı adıyla geçerli; varsayılanlar dolar (instagram, Europe/Istanbul, TR)", () => {
    const parsed = createWorkspaceSchema.parse(valid);
    expect(parsed).toMatchObject({ name: "Kahve Dükkanı", handle: "kahve.dukkani", platform: "instagram", timezone: "Europe/Istanbul", complianceRegion: "TR" });
    expect(parsed.nicheBrief).toBeUndefined();
    expect(parsed.audienceTimezone).toBeUndefined();
  });

  it("kullanıcı adı: baştaki @ atılır, küçük harfe çevrilir, boşluk kırpılır", () => {
    expect(createWorkspaceSchema.parse({ ...valid, handle: "  @Kahve_Dukkani " }).handle).toBe("kahve_dukkani");
  });

  it("geçersiz kullanıcı adı (HANDLE_PATTERN) Türkçe mesajla reddedilir", () => {
    for (const handle of ["", "boşluklu ad", "ç-ğ", "a".repeat(51), "kötü/ad", "@@x"]) {
      const result = createWorkspaceSchema.safeParse({ ...valid, handle });
      expect(result.success, handle).toBe(false);
    }
    const message = createWorkspaceSchema.safeParse({ ...valid, handle: "a b" }).error?.issues[0]?.message;
    expect(message).toMatch(/Kullanıcı adı/);
  });

  it("ad boş ya da 100 karakterden uzun olamaz", () => {
    expect(createWorkspaceSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ ...valid, name: "x".repeat(101) }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ ...valid, name: "x".repeat(100) }).success).toBe(true);
    expect(createWorkspaceSchema.safeParse({ handle: "kahve" }).success).toBe(false);
  });

  it("form boş alanı '' gönderir: verilmedi sayılır (varsayılan/undefined)", () => {
    const parsed = createWorkspaceSchema.parse({ ...valid, nicheBrief: "", timezone: "  ", audienceTimezone: "", complianceRegion: "", platform: "" });
    expect(parsed.timezone).toBe("Europe/Istanbul");
    expect(parsed.complianceRegion).toBe("TR");
    expect(parsed.platform).toBe("instagram");
    expect(parsed.nicheBrief).toBeUndefined();
    expect(parsed.audienceTimezone).toBeUndefined();
  });

  it("saat dilimi IANA adı olmalı; uyum bölgesi TR | US | TR_US", () => {
    expect(createWorkspaceSchema.safeParse({ ...valid, timezone: "Istanbul/Merkez" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ ...valid, audienceTimezone: "Mars/Olympus" }).success).toBe(false);
    expect(createWorkspaceSchema.parse({ ...valid, audienceTimezone: "America/New_York", complianceRegion: "TR_US" })).toMatchObject({
      audienceTimezone: "America/New_York",
      complianceRegion: "TR_US",
    });
    expect(createWorkspaceSchema.safeParse({ ...valid, complianceRegion: "EU" }).success).toBe(false);
  });

  it("TikTok hesabı açılabilir; kullanıcı adı TikTok kuralıyla denetlenir (nokta, alt çizgi, 2–24 karakter, tire yok)", () => {
    const tiktok = { ...valid, platform: "tiktok" };
    expect(createWorkspaceSchema.parse({ ...tiktok, handle: "@Kahve.Dukkani_1" })).toMatchObject({ platform: "tiktok", handle: "kahve.dukkani_1" });
    for (const handle of ["kahve-dukkani", "a", "a".repeat(25), "kahve."]) {
      const result = createWorkspaceSchema.safeParse({ ...tiktok, handle });
      expect(result.success, handle).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: ["handle"], message: "Bu kullanıcı adı seçilen platformda geçerli değil." });
    }
    // Aynı adlar Instagram'da geçerlidir: kural platformun modülünden gelir.
    for (const handle of ["kahve-dukkani", "a", "a".repeat(25), "kahve."]) expect(createWorkspaceSchema.safeParse({ ...valid, handle }).success, handle).toBe(true);
  });

  it("niş özeti 2000 karakteri aşamaz; modülü olmayan platform (YouTube) henüz reddedilir", () => {
    expect(createWorkspaceSchema.safeParse({ ...valid, nicheBrief: "n".repeat(2001) }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ ...valid, nicheBrief: "n".repeat(2000) }).success).toBe(true);
    expect(createWorkspaceSchema.safeParse({ ...valid, platform: "youtube" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ ...valid, platform: "snapchat" }).success).toBe(false);
  });
});

describe("slugBase", () => {
  it("Türkçe harfleri katlar ve tire ile birleştirir", () => {
    expect(slugBase("Ayşe'nin Kahvesi")).toBe("ayse-nin-kahvesi");
    expect(slugBase("  ÇİĞDEM & Ortakları!! ")).toBe("cigdem-ortaklari");
  });

  it("DB kuralına uyar: ≤ 60 karakter, tireyle bitmez; harf yoksa sabit ad", () => {
    expect(slugBase("a".repeat(200))).toHaveLength(60);
    expect(slugBase(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    expect(slugBase("!!!")).toBe("calisma-alani");
    expect(slugBase("Ornek")).toMatch(/^[a-z0-9][a-z0-9-]{0,62}$/);
  });
});
