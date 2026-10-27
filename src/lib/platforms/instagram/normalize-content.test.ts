import { describe, expect, it } from "vitest";
import { COAUTHORS_MAX, normalizeContent, parseContent } from "@/lib/platforms/instagram/normalize-content";
import { loadFixture, reelRow } from "@/lib/platforms/instagram/test-support";
import type { NormalizedContent } from "@/lib/platforms/types";

function only(row: Record<string, unknown>): NormalizedContent {
  const result = normalizeContent(row);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe("Instagram içerik — gerçek reel fixture (instagram-reel-scraper, @ornekhesap)", () => {
  const raw = loadFixture("reel");
  const parsed = parseContent(raw);

  it("10 satırın 10'u içerik; öğe olmayan satır ve erişim hatası yok", () => {
    expect(raw).toHaveLength(10);
    expect(parsed.items).toHaveLength(10);
    expect(parsed.notItems).toEqual([]);
    expect(parsed.accessError).toBeUndefined();
  });

  it("clips → short_video; kimlik, kısa kod, bağlantı, sahip, tarih, süre, etiketler", () => {
    for (const [i, item] of parsed.items.entries()) {
      const row = raw[i];
      expect(item.platform).toBe("instagram");
      expect(item.format).toBe("short_video");
      expect(item.externalId).toBe(row.id);
      expect(item.shortcode).toBe(row.shortCode);
      expect(item.url).toBe(row.url);
      expect(item.ownerHandle).toBe("ornekhesap");
      expect(item.publishedAt).toBe(row.timestamp);
      expect(item.durationSec).toBeCloseTo(row.videoDuration as number, 1);
      expect(item.caption).toBe(row.caption);
      expect(item.hashtags).toEqual(row.hashtags);
      expect(item.hashtags.length).toBeGreaterThan(0);
    }
  });

  it("viewsKind: aktör yalnız videoPlayCount verdi → ig_play_count; videoViewCount null → extra'ya yazılmaz", () => {
    for (const [i, item] of parsed.items.entries()) {
      expect(raw[i].videoViewCount).toBeNull();
      expect(item.metrics.viewsKind).toBe("ig_play_count");
      expect(item.metrics.views).toBe(raw[i].videoPlayCount);
      expect(item.metrics.likes).toBe(raw[i].likesCount);
      expect(item.metrics.comments).toBe(raw[i].commentsCount);
      expect("igViewCount" in item.metrics.extra).toBe(false);
    }
  });

  it("isPinned: aktör false verir → alan hiç yazılmaz (yalnız true ya da undefined)", () => {
    for (const [i, item] of parsed.items.entries()) {
      expect(raw[i].isPinned).toBe(false);
      expect("isPinned" in item).toBe(false);
    }
  });

  it("missingFields dolu: herkese açık veride paylaşım/kaydetme/erişim/izlenme süresi yok", () => {
    for (const item of parsed.items) {
      expect(item.missingFields).toEqual(["shares", "saves", "reach", "avgWatchSec"]);
      for (const field of item.missingFields) expect(item.metrics[field as keyof typeof item.metrics]).toBeUndefined();
    }
  });

  it("ephemeralMediaUrl = videoUrl; transcript istenmedi → yok", () => {
    for (const [i, item] of parsed.items.entries()) {
      expect(item.ephemeralMediaUrl).toBe(raw[i].videoUrl);
      expect(item.ephemeralMediaUrl).toMatch(/^https:\/\//);
      expect("transcript" in item).toBe(false);
    }
  });
});

describe("Instagram içerik — eski (instagram-scraper) gönderi fixture'ı", () => {
  const raw = loadFixture("posts.legacy");
  const parsed = parseContent(raw);
  const byCode = (code: string): NormalizedContent => {
    const found = parsed.items.find((i) => i.shortcode === code);
    if (!found) throw new Error(`fixture'da yok: ${code}`);
    return found;
  };

  it("12 satırın 12'si içerik; biçim dağılımı ham type/productType ile tutarlı", () => {
    expect(parsed.items).toHaveLength(12);
    expect(parsed.notItems).toEqual([]);
    const count = (format: string) => parsed.items.filter((i) => i.format === format).length;
    expect(count("short_video")).toBe(raw.filter((r) => r.productType === "clips").length);
    expect(count("carousel")).toBe(raw.filter((r) => r.type === "Sidecar").length);
    expect(count("image")).toBe(raw.filter((r) => r.type === "Image").length);
    expect(count("short_video")).toBe(5);
    expect(count("carousel")).toBe(6);
    expect(count("image")).toBe(1);
  });

  it("viewsKind ayrı: ikisi de varsa oynatma seçilir, görüntüleme extra'da; ikisi karışmaz", () => {
    const video = byCode("DXpIWGjDa36");
    expect(video.metrics.views).toBe(13923);
    expect(video.metrics.viewsKind).toBe("ig_play_count");
    expect(video.metrics.extra.igViewCount).toBe(4667);
    for (const item of parsed.items.filter((i) => i.format === "short_video")) {
      expect(item.metrics.viewsKind).toBe("ig_play_count");
      expect(item.metrics.views).not.toBe(item.metrics.extra.igViewCount);
    }
  });

  it("görsel/karusel: izlenme ve viewsKind yok, missingFields'ta views; avgWatchSec yalnız videoda", () => {
    for (const item of parsed.items.filter((i) => i.format !== "short_video")) {
      expect(item.metrics.views).toBeUndefined();
      expect(item.metrics.viewsKind).toBeUndefined();
      expect(item.missingFields).toContain("views");
      expect(item.missingFields).not.toContain("avgWatchSec");
      expect(item.durationSec).toBeUndefined();
      expect(item.ephemeralMediaUrl).toBeUndefined();
    }
    expect(byCode("DXpIWGjDa36").missingFields).toContain("avgWatchSec");
  });

  it("isPinned yalnız true ya da undefined: ham isPinned=true olanlar true, diğerleri alansız", () => {
    const pinned = parsed.items.filter((i) => i.isPinned === true);
    expect(pinned.map((i) => i.shortcode).sort()).toEqual(
      raw.filter((r) => r.isPinned === true).map((r) => r.shortCode as string).sort(),
    );
    expect(pinned).toHaveLength(3);
    for (const item of parsed.items.filter((i) => i.isPinned === undefined)) expect("isPinned" in item).toBe(false);
  });

  it("gizli beğeni (-1): likes YAZILMAZ (0 değil), extra.likesHidden ve missingFields'ta likes", () => {
    const hidden = raw.filter((r) => (r.likesCount as number) < 0).map((r) => r.shortCode as string);
    expect(hidden.length).toBeGreaterThan(0);
    for (const code of hidden) {
      const item = byCode(code);
      expect(item.metrics.likes).toBeUndefined();
      expect(item.metrics.extra.likesHidden).toBe(true);
      expect(item.missingFields).toContain("likes");
    }
    expect(byCode("DcLtgUZjbRa").metrics.likes).toBe(27);
  });

  it("ownerHandle içeriğin listelendiği profildir; ortak yazar hesabı çıktıya geçmez", () => {
    const collab = raw.find((r) => r.ownerUsername !== "ornekguzellik");
    expect(collab).toBeDefined();
    const item = byCode(collab?.shortCode as string);
    expect(item.ownerHandle).toBe("ornekguzellik");
    expect(JSON.stringify(parsed.items)).not.toContain("ornek.ortak.hesap");
  });
});

describe("Instagram içerik — kurallar (sentetik satırlar)", () => {
  it("yalnız videoViewCount varsa ig_view_count; oynatma sayısı yoksa extra.igViewCount yazılmaz", () => {
    const item = only(reelRow({ videoPlayCount: undefined, videoViewCount: 500 }));
    expect(item.metrics.views).toBe(500);
    expect(item.metrics.viewsKind).toBe("ig_view_count");
    expect("igViewCount" in item.metrics.extra).toBe(false);
  });

  it("ikisi de yoksa izlenme ve viewsKind yazılmaz; missingFields'ta views", () => {
    const item = only(reelRow({ videoPlayCount: undefined, videoViewCount: null }));
    expect("views" in item.metrics).toBe(false);
    expect("viewsKind" in item.metrics).toBe(false);
    expect(item.missingFields).toContain("views");
  });

  it("0 ≠ undefined: ölçülmüş sıfırlar korunur", () => {
    const item = only(reelRow({ videoPlayCount: 0, likesCount: 0, commentsCount: 0 }));
    expect(item.metrics).toMatchObject({ views: 0, viewsKind: "ig_play_count", likes: 0, comments: 0 });
    expect(item.missingFields).not.toContain("views");
    expect(item.missingFields).not.toContain("likes");
    expect(item.missingFields).not.toContain("comments");
  });

  it("ölçülmeyen sayaç alanı yoksa yazılmaz", () => {
    const item = only(reelRow({ likesCount: undefined, commentsCount: undefined }));
    expect("likes" in item.metrics).toBe(false);
    expect("comments" in item.metrics).toBe(false);
    expect(item.missingFields).toEqual(expect.arrayContaining(["likes", "comments"]));
  });

  it("kapalı yorum: comments yazılmaz (sıfır sayılmaz), extra.commentsDisabled", () => {
    const item = only(reelRow({ isCommentsDisabled: true, commentsCount: 0 }));
    expect("comments" in item.metrics).toBe(false);
    expect(item.metrics.extra.commentsDisabled).toBe(true);
    expect(item.missingFields).toContain("comments");
  });

  it("isPinned: yalnız gerçek true geçer", () => {
    expect(only(reelRow({ isPinned: true })).isPinned).toBe(true);
    for (const value of [false, "true", 1, null, undefined]) {
      expect("isPinned" in only(reelRow({ isPinned: value }))).toBe(false);
    }
  });

  it("paidPartnership boolean korunur (false ≠ undefined)", () => {
    expect(only(reelRow({ paidPartnership: true })).isPaidPartnership).toBe(true);
    expect(only(reelRow({ paidPartnership: false })).isPaidPartnership).toBe(false);
    expect("isPaidPartnership" in only(reelRow({ paidPartnership: undefined }))).toBe(false);
  });

  it("biçim kuralı: igtv → long_video; feed videosu süreye göre; görsel; belirlenemeyen notItems'a", () => {
    expect(only(reelRow({ productType: "igtv" })).format).toBe("long_video");
    expect(only(reelRow({ productType: "feed", type: "Video", videoDuration: 400 })).format).toBe("long_video");
    expect(only(reelRow({ productType: "feed", type: "Video", videoDuration: 40 })).format).toBe("short_video");
    const image = only({ id: "1", shortCode: "A", type: "Image", productType: "feed", likesCount: 3 });
    expect(image.format).toBe("image");
    expect(image.durationSec).toBeUndefined();

    const unknown = parseContent([{ id: "2", shortCode: "B" }]);
    expect(unknown.items).toEqual([]);
    expect(unknown.notItems[0].reason).toMatch(/biçimi belirlenemedi/);
  });

  it("kimlik yoksa uydurulmaz: satır notItems'a düşer; kısa kod yedek kimliktir", () => {
    const noId = parseContent([reelRow({ id: undefined, shortCode: undefined, pk: undefined })]);
    expect(noId.items).toEqual([]);
    expect(noId.notItems[0].reason).toMatch(/kimliği yok/);
    expect(only(reelRow({ id: undefined })).externalId).toBe(reelRow().shortCode);
    // 2^53'ü aşan sayı kimlik sayılmaz (kesilmiş olabilir)
    expect(parseContent([reelRow({ id: Number("3983939388063538023"), shortCode: undefined })]).items).toEqual([]);
  });

  it("bağlantı: aktör url'i yoksa kısa koddan, o da yoksa sayısal kimlikten türetilir", () => {
    expect(only(reelRow({ url: undefined })).url).toBe(`https://www.instagram.com/p/${reelRow().shortCode}/`);
    expect(only(reelRow({ url: undefined, shortCode: undefined })).url).toBe("https://www.instagram.com/p/DdJy8QANttn/");
    // https olmayan bağlantı (ör. betik şeması) kabul edilmez; şema sözcüğü parçalı yazılır (AGENTS.md ek grep'i src'yi tarar).
    expect(only(reelRow({ url: "java" + "script:alert(1)", shortCode: "ABC" })).url).toBe("https://www.instagram.com/p/ABC/");
  });

  it("etiketler: dizi yoksa açıklamadan; # atılır, tekrarlar elenir", () => {
    const fromCaption = only(reelRow({ hashtags: undefined, caption: "Merhaba #Kahve #kahve #İstanbul_günü sonu" }));
    expect(fromCaption.hashtags).toEqual(["Kahve", "İstanbul_günü"]);
    expect(only(reelRow({ hashtags: ["#a", "a", "b"] })).hashtags).toEqual(["a", "b"]);
    expect(only(reelRow({ hashtags: [], caption: undefined })).hashtags).toEqual([]);
  });

  it("transcript: düz metin, nesne ve dizi biçimleri; olmayan alan yazılmaz", () => {
    expect(only(reelRow({ transcript: "merhaba dünya" })).transcript).toBe("merhaba dünya");
    expect(only(reelRow({ transcript: { text: "obje metni" } })).transcript).toBe("obje metni");
    expect(only(reelRow({ transcript: [{ vtt: "" }, { plaintext: "dizi metni" }] })).transcript).toBe("dizi metni");
    expect("transcript" in only(reelRow({ transcript: null }))).toBe(false);
    expect("transcript" in only(reelRow({ transcript: [] }))).toBe(false);
  });

  it("ownerHandle: inputUrl yoksa ownerUsername yedek; ikisi de geçersizse alan yok", () => {
    expect(only(reelRow({ inputUrl: undefined, ownerUsername: "Yedek.Hesap" })).ownerHandle).toBe("yedek.hesap");
    expect("ownerHandle" in only(reelRow({ inputUrl: undefined, ownerUsername: undefined }))).toBe(false);
  });

  it("geçersiz tarih ve süre alanı yazılmaz", () => {
    const item = only(reelRow({ timestamp: "dün", videoDuration: 0 }));
    expect("publishedAt" in item).toBe(false);
    expect("durationSec" in item).toBe(false);
  });
});

describe("Instagram içerik — ortak yazarlar (coauthors): yalnız herkese açık kullanıcı adı", () => {
  it("coauthorProducers → coauthors: küçük harf, tekrarsız, geçerli biçim, içeriğin sahibi hariç", () => {
    const item = only(
      reelRow({
        inputUrl: "https://www.instagram.com/asil.sahip",
        coauthorProducers: [
          { username: "Ortak.Bir" },
          { username: "ortak.bir" },
          { userName: "Ortak_Iki" },
          "@ortak.uc",
          { username: "asil.sahip" },
          { username: "geçersiz ad" },
          { id: "9" },
          42,
        ],
      }),
    );
    expect(item.coauthors).toEqual(["ortak.bir", "ortak_iki", "ortak.uc"]);
  });

  it("ad, kimlik, fotoğraf ve doğrulama alanları okunmaz (çıktıda yalnız kullanıcı adı)", () => {
    const item = only(reelRow({ coauthorProducers: [{ id: "77", username: "ortak.hesap", full_name: "Gizli Ad", profile_pic_url: "https://cdn.example/x.jpg", is_verified: true }] }));
    expect(item.coauthors).toEqual(["ortak.hesap"]);
    const json = JSON.stringify(item);
    for (const leaked of ["Gizli Ad", '"77"', "x.jpg", "is_verified", "full_name"]) expect(json).not.toContain(leaked);
  });

  it("alan yok / boş / tümü geçersiz → coauthors yazılmaz (boş dizi de değil)", () => {
    expect("coauthors" in only(reelRow())).toBe(false);
    expect("coauthors" in only(reelRow({ coauthorProducers: [] }))).toBe(false);
    expect("coauthors" in only(reelRow({ coauthorProducers: [{ username: "kötü ad" }, { id: "1" }] }))).toBe(false);
    expect("coauthors" in only(reelRow({ coauthorProducers: "yok" }))).toBe(false);
  });

  it("en çok COAUTHORS_MAX kullanıcı adı saklanır", () => {
    const many = Array.from({ length: COAUTHORS_MAX + 5 }, (_, i) => ({ username: `ortak${i}` }));
    expect(only(reelRow({ coauthorProducers: many })).coauthors).toHaveLength(COAUTHORS_MAX);
  });
});
