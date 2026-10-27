/**
 * Uyum testi (PLAN.md "Uyum kuralları") — TikTok: yorumcu, anılan, düet / dikiş ve müzik sahibi gibi üçüncü kişi verisi ile yazarın
 * ad / foto / kimlik alanları normalize'da ATILIR. Ham satıra sahte veri enjekte edilir; çıktıda hiçbir izi kalmamalı.
 * Çıktıda kalan tek kişi bilgisi içeriğin sahibinin herkese açık KULLANICI ADIDIR (`ownerHandle` / profil `handle`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeContent, parseContent } from "@/lib/platforms/tiktok/normalize-content";
import { parseProfiles } from "@/lib/platforms/tiktok/normalize-profile";
import { loadFixture, videoRow } from "@/lib/platforms/tiktok/test-support";

const COMMENTER = "yorumcu.kisi_42";
const COMMENT_TEXT = "gizli yorum metni 9f3a";
const MENTIONED = "anilan.kisi";
const DUET_OWNER = "duet.sahibi";
const MUSIC_AUTHOR = "muzik.sahibi_77";
const NICKNAME = "Gizli Görünen Ad";
const AUTHOR_ID = "6911112222333344445";
const SEC_UID = "MS4wLjABAAAA-gizli-sec-uid";
const AVATAR = "https://p16-sign.example-cdn.test/avatar-gizli-5c1e";

/** Çıktıda ASLA geçmeyen değerler. */
const INJECTED_VALUES = [COMMENTER, COMMENT_TEXT, MENTIONED, DUET_OWNER, MUSIC_AUTHOR, NICKNAME, AUTHOR_ID, SEC_UID, AVATAR, "konum-gizli-88", "efekt-gizli-12"];

function dirtyRow(): Record<string, unknown> {
  return videoRow({
    authorMeta: {
      id: AUTHOR_ID,
      secUid: SEC_UID,
      name: "ornek.hesap",
      nickName: NICKNAME,
      avatar: AVATAR,
      originalAvatarUrl: AVATAR,
      roomId: AUTHOR_ID,
      region: "konum-gizli-88",
      signature: "Örnek biyografi metni. Her gün kısa ipuçları.",
      fans: 18400,
      following: 212,
      video: 148,
      verified: false,
      privateAccount: false,
    },
    mentions: [`@${MENTIONED}`],
    detailedMentions: [{ id: AUTHOR_ID, name: MENTIONED, nickName: NICKNAME, profileUrl: `https://www.tiktok.com/@${MENTIONED}`, secUid: SEC_UID }],
    comments: [{ cid: "c1", text: COMMENT_TEXT, uid: AUTHOR_ID, uniqueId: COMMENTER, avatarThumbnail: AVATAR, mentions: [MENTIONED] }],
    commentsDatasetUrl: `https://api.apify.com/v2/datasets/${COMMENTER}/items`,
    musicMeta: { musicName: "original sound", musicAuthor: MUSIC_AUTHOR, musicId: AUTHOR_ID, playUrl: AVATAR },
    duetInfo: { duetFromId: AUTHOR_ID, authorName: DUET_OWNER },
    stitchInfo: { authorName: DUET_OWNER },
    effectStickers: [{ ID: "1", name: "efekt-gizli-12" }],
    locationMeta: { address: "konum-gizli-88", city: "konum-gizli-88" },
    locationCreated: "konum-gizli-88",
  });
}

/** İçerik çıktısında serbestçe geçebilecek üst düzey alanlar. */
const ALLOWED_CONTENT_KEYS = new Set(["platform", "externalId", "shortcode", "url", "ownerHandle", "format", "publishedAt", "caption", "hashtags", "durationSec", "isPinned", "isPaidPartnership", "metrics", "missingFields"]);
const ALLOWED_PROFILE_KEYS = new Set(["platform", "handle", "bio", "followers", "following", "postsCount", "isPrivate", "isVerified", "isBusinessAccount", "category", "externalUrl", "missingFields"]);
const FORBIDDEN_KEYS = ["authorMeta", "musicMeta", "mentions", "detailedMentions", "commentsDatasetUrl", "duetInfo", "stitchInfo", "effectStickers", "locationMeta", "nickName", "avatar", "secUid", "displayName", "avatarUrl", "coauthors", "ephemeralMediaUrl", "mediaUrls"];

function assertClean(value: object, allowed: ReadonlySet<string>): void {
  const json = JSON.stringify(value);
  for (const injected of INJECTED_VALUES) expect(json, injected).not.toContain(injected);
  for (const key of FORBIDDEN_KEYS) expect(json, key).not.toContain(`"${key}"`);
  for (const key of Object.keys(value)) expect(allowed.has(key), `beklenmeyen çıktı alanı: ${key}`).toBe(true);
}

describe("TikTok içerik: yorumcu / üçüncü kişi / yazar kimliği çıktıya geçmez", () => {
  it("enjekte edilmiş yorumcu, anılan, düet-dikiş sahibi, müzik sahibi ve yazar kimliği çıktıda yok", () => {
    const result = normalizeContent(dirtyRow());
    if (!result.ok) throw new Error(result.reason);
    assertClean(result.value, ALLOWED_CONTENT_KEYS);
    // Kirli satırın çıktısı temiz satırınkiyle AYNI: bu alanlar hiçbir çıktı alanını etkilemez.
    expect(result).toEqual(normalizeContent(videoRow()));
  });

  it("fixture satırlarının hiçbir çıktısı yasak alan taşımaz", () => {
    for (const item of parseContent(loadFixture("videos")).items) assertClean(item, ALLOWED_CONTENT_KEYS);
  });

  it("açıklamadaki anma metni dışında anılan hesap hiçbir alanda görünmez (ortak yazar / aday üretilmez)", () => {
    const result = normalizeContent(dirtyRow());
    expect(result.ok && result.value).not.toHaveProperty("coauthors");
  });
});

describe("TikTok profil: yalnız herkese açık kullanıcı adı + sayılar + künye", () => {
  it("yazarın görünen adı, kimliği, fotoğrafı ve satırın video tarafı profile geçmez", () => {
    const { items } = parseProfiles([dirtyRow()]);
    expect(items).toHaveLength(1);
    assertClean(items[0], ALLOWED_PROFILE_KEYS);
    expect(items[0]).not.toHaveProperty("relatedHandles");
    expect(JSON.stringify(items[0])).not.toContain("Örnek açıklama"); // video açıklaması profile sızmaz
  });
});

describe("TikTok fixture'ları", () => {
  it("Apify anahtarı, yorum ve gerçek CDN adresi içermez", () => {
    const dir = fileURLToPath(new URL("../../../../fixtures/apify/tiktok", import.meta.url));
    // Anahtar öneki parçalı yazılır: "Apify anahtarı repoda yok" grep'i bu dosyayı da tarar.
    const forbidden = new RegExp(["apify" + "_api_", '"comments"', '"secUid"', "tiktokcdn", "x-signature"].join("|"));
    const offenders = readdirSync(dir).filter((name) => forbidden.test(readFileSync(join(dir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
