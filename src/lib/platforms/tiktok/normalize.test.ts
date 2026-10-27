import { describe, expect, it } from "vitest";

import { resolveProfileAccess } from "@/lib/collection/profile-rows";
import { normalizeContent, parseContent } from "@/lib/platforms/tiktok/normalize-content";
import { parseProfiles } from "@/lib/platforms/tiktok/normalize-profile";
import { loadFixture, videoRow } from "@/lib/platforms/tiktok/test-support";

describe("TikTok içerik normalizasyonu", () => {
  const { items, notItems, accessError } = parseContent(loadFixture("videos"));

  it("düz video: kimlik, bağlantı, sahip, sayılar, etiketler", () => {
    expect(notItems).toEqual([]);
    expect(accessError).toBeUndefined();
    expect(items[0]).toEqual({
      platform: "tiktok",
      externalId: "7500000000000000001",
      shortcode: "7500000000000000001",
      url: "https://www.tiktok.com/@ornek.hesap/video/7500000000000000001",
      ownerHandle: "ornek.hesap",
      format: "short_video",
      publishedAt: "2026-09-22T14:13:20.000Z",
      caption: "Örnek açıklama 1 #ipucu #Verimlilik",
      hashtags: ["ipucu", "Verimlilik"],
      durationSec: 21,
      isPaidPartnership: false,
      metrics: { views: 25000, viewsKind: "tt_play_count", likes: 1200, comments: 15, shares: 40, saves: 90, extra: { repostCount: 0 } },
      missingFields: ["reach", "avgWatchSec"],
    });
  });

  it("sabitlenmiş + sponsorlu, slayt gönderisi ve uzun video ayrılır", () => {
    expect(items[1]).toMatchObject({ isPinned: true, isPaidPartnership: true });
    expect(items[2]).toMatchObject({ format: "carousel" });
    expect(items[2]).not.toHaveProperty("durationSec");
    expect(items[2].missingFields).not.toContain("avgWatchSec"); // video değil: uygulanamaz
    expect(items[3]).toMatchObject({ format: "long_video", durationSec: 412, hashtags: ["UzunAnlatım"] });
  });

  it("verilmeyen sayı yazılmaz: undefined ≠ 0", () => {
    const { metrics, missingFields } = items[3];
    expect(metrics).not.toHaveProperty("saves"); // alan hiç yok
    expect(metrics).not.toHaveProperty("shares"); // null
    expect(missingFields).toEqual(expect.arrayContaining(["saves", "shares"]));
    const zero = normalizeContent(videoRow({ playCount: 0, diggCount: 0 }));
    expect(zero.ok && zero.value.metrics).toMatchObject({ views: 0, likes: 0 }); // ölçülmüş sıfır yazılır
    const negative = normalizeContent(videoRow({ playCount: -1, diggCount: "1.2K" }));
    expect(negative.ok && negative.value.metrics).not.toHaveProperty("views");
    expect(negative.ok && negative.value.metrics).not.toHaveProperty("likes");
  });

  it("video adresi hiçbir biçimde çıktıya geçmez (indirme yok)", () => {
    const row = videoRow({ mediaUrls: ["https://v19-webapp.tiktok.com/video/tos/gizli.mp4"], videoMeta: { duration: 12, downloadAddr: "https://v16-webapp.tiktok.com/indir.mp4" } });
    const result = normalizeContent(row);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).not.toHaveProperty("ephemeralMediaUrl");
    expect(JSON.stringify(result.value)).not.toMatch(/\.mp4|webapp/);
  });

  it("bağlantı aktörden yalnız aynı kimliğin TikTok adresiyse alınır; değilse kimlikten kurulur", () => {
    const foreign = normalizeContent(videoRow({ webVideoUrl: "https://evil.example/@ornek.hesap/video/7500000000000000001" }));
    expect(foreign.ok && foreign.value.url).toBe("https://www.tiktok.com/@/video/7500000000000000001");
    const other = normalizeContent(videoRow({ webVideoUrl: "https://www.tiktok.com/@ornek.hesap/video/7999999999999999999" }));
    expect(other.ok && other.value.url).toBe("https://www.tiktok.com/@/video/7500000000000000001");
  });

  it("kimliksiz / sayısal olmayan kimlikli satır öğe değildir", () => {
    expect(normalizeContent(videoRow({ id: undefined }))).toEqual({ ok: false, reason: "içerik kimliği yok (id)" });
    expect(normalizeContent(videoRow({ id: "abc" })).ok).toBe(false);
    // 2^53'ü aşan sayısal kimlik kesilmiş olabilir: uydurulmaz.
    expect(normalizeContent(videoRow({ id: 7500000000000000001 })).ok).toBe(false);
  });

  it("sahip adı yoksa işin hedefinden (`input`) okunur", () => {
    const result = normalizeContent(videoRow({ authorMeta: undefined, input: "https://www.tiktok.com/@Ornek.Hesap" }));
    expect(result.ok && result.value.ownerHandle).toBe("ornek.hesap");
  });
});

describe("TikTok profil normalizasyonu (künye video satırından)", () => {
  it("aynı hesabın satırlarından TEK profil; yalnız künye alanları", () => {
    const { items, notItems } = parseProfiles(loadFixture("videos"));
    expect(notItems).toEqual([]);
    expect(items).toEqual([
      {
        platform: "tiktok",
        handle: "ornek.hesap",
        bio: "Örnek biyografi metni. Her gün kısa ipuçları.",
        followers: 18400,
        following: 212,
        postsCount: 148,
        isPrivate: false,
        isVerified: false,
        isBusinessAccount: true,
        category: "Education",
        externalUrl: "https://ornek.example/baglanti",
        missingFields: [],
      },
    ]);
  });

  it("sayılar yoksa ölçülemeyen olarak listelenir (0 yazılmaz)", () => {
    const { items } = parseProfiles([videoRow({ authorMeta: { name: "ornek.hesap", fans: null } })]);
    expect(items[0]).toEqual({ platform: "tiktok", handle: "ornek.hesap", missingFields: ["followers", "following", "postsCount"] });
  });

  it("künyesiz satır öğe değildir", () => {
    expect(parseProfiles([videoRow({ authorMeta: undefined })]).notItems).toEqual([{ reason: "satırda hesap künyesi yok (authorMeta)" }]);
  });
});

describe("TikTok erişim hataları → Instagram'daki sonuç sınıfları", () => {
  const errors = loadFixture("errors");

  it("tek hedef: gizli → private, bulunamayan / boş → not_found", () => {
    expect(parseProfiles([errors[0]]).accessError).toBe("private");
    expect(parseProfiles([errors[1]]).accessError).toBe("not_found");
    expect(parseProfiles([errors[2]]).accessError).toBe("not_found");
    expect(parseContent([errors[0]]).accessError).toBe("private");
    expect(parseContent([{ error: "Post not found or private", errorCode: "POST_NOT_FOUND_OR_PRIVATE" }]).accessError).toBe("not_found");
    expect(parseContent([{ error: "Something odd", errorCode: "WEIRD_CODE" }]).accessError).toBe("weird_code");
  });

  it("toplu profil işi: hata satırı hesabıyla eşlenir, diğer hesap gelir", () => {
    const parsed = parseProfiles([...loadFixture("videos").slice(0, 1), ...errors]);
    expect(parsed.accessError).toBeUndefined(); // en az bir profil geldi
    expect(parsed.notItems).toEqual([
      { reason: "profile_private — Profile is private (@ornek.gizli)" },
      { reason: "not_found — Profile not found (@ornek.bulunmayan)" },
      { reason: "profile_empty — Profile has no videos (@ornek.bos)" },
    ]);
    expect(resolveProfileAccess("ornek.hesap", parsed, 4).access.state).toBe("ok");
    expect(resolveProfileAccess("ornek.gizli", parsed, 4).access.state).toBe("private");
    expect(resolveProfileAccess("ornek.bulunmayan", parsed, 4).access.state).toBe("not_found");
  });

  it("gizli hesap künye satırıyla gelirse de private sayılır", () => {
    const parsed = parseProfiles([videoRow({ authorMeta: { name: "ornek.hesap", privateAccount: true } })]);
    expect(resolveProfileAccess("ornek.hesap", parsed, 1).access.state).toBe("private");
  });
});
