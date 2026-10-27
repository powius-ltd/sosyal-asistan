/**
 * Uyum testi (PLAN.md "Uyum kuralları"): yorumcu ve üçüncü kişi kimlikleri normalize'da ATILIR.
 * Ham satıra sahte yorumcu/etiket/ortak yazar verisi enjekte edilir; çıktıda hiçbir izi kalmamalı.
 * TEK İSTİSNA (kullanıcı kararı, 2026-09-30): ortak yazarın herkese açık KULLANICI ADI `coauthors` olarak tutulur (keşif ağı);
 * onun adı/kimliği/fotoğrafı ve tüm yorumcu/etiket/anılan/sponsor verisi yine çıkmaz.
 */
import { describe, expect, it } from "vitest";
import { normalizeContent, parseContent } from "@/lib/platforms/instagram/normalize-content";
import { normalizeProfile } from "@/lib/platforms/instagram/normalize-profile";
import { loadFixture, reelRow } from "@/lib/platforms/instagram/test-support";
import type { NormalizedContent } from "@/lib/platforms/types";

const COMMENTER = "yorumcu.kisi_42";
const COMMENT_TEXT = "gizli yorum metni 9f3a";
const TAGGED = "etiketlenen.hesap";
const COAUTHOR = "ortak.yazar.hesap";
const FULL_NAME = "Yorumcu Tam Ad";
const OWNER_ID = "778899001122";

/** Çıktıda ASLA geçmeyen değerler. Ortak yazarın kullanıcı adı (`COAUTHOR`) bilinçli olarak burada DEĞİL: `coauthors`'ta görünür. */
const INJECTED_VALUES = [COMMENTER, COMMENT_TEXT, TAGGED, FULL_NAME, OWNER_ID, "sponsor.marka", "anilan.kisi", "coauthor-id-7d41"];

function dirtyRow(): Record<string, unknown> {
  return reelRow({
    firstComment: COMMENT_TEXT,
    latestComments: [
      {
        id: "c1",
        text: COMMENT_TEXT,
        ownerUsername: COMMENTER,
        owner: { id: OWNER_ID, username: COMMENTER, full_name: FULL_NAME, is_verified: false },
        timestamp: "2026-09-12T10:00:00.000Z",
        likesCount: 2,
      },
    ],
    taggedUsers: [{ id: "t1", username: TAGGED, full_name: FULL_NAME }],
    coauthorProducers: [{ id: "coauthor-id-7d41", username: COAUTHOR, full_name: FULL_NAME }],
    mentions: ["anilan.kisi"],
    sponsors: [{ sponsor: { username: "sponsor.marka" } }],
    ownerId: OWNER_ID,
    ownerFullName: FULL_NAME,
  });
}

/** Çıktıda serbestçe geçebilecek üst düzey alanlar. `owner*` içinde YALNIZ `ownerHandle` (feed sahibi) vardır. */
const ALLOWED_KEYS = new Set([
  "platform",
  "externalId",
  "shortcode",
  "url",
  "ownerHandle",
  "format",
  "publishedAt",
  "caption",
  "hashtags",
  "durationSec",
  "isPinned",
  "isPaidPartnership",
  "coauthors",
  "transcript",
  "ephemeralMediaUrl",
  "metrics",
  "missingFields",
]);

const FORBIDDEN_KEYS = ["latestComments", "firstComment", "taggedUsers", "coauthorProducers", "mentions", "sponsors", "ownerId", "ownerFullName", "ownerUsername", "owner"];

function assertClean(content: NormalizedContent): void {
  const json = JSON.stringify(content);
  for (const value of INJECTED_VALUES) expect(json, value).not.toContain(value);
  for (const key of FORBIDDEN_KEYS) expect(json, key).not.toContain(`"${key}"`);
  for (const key of Object.keys(content)) expect(ALLOWED_KEYS.has(key), `beklenmeyen çıktı alanı: ${key}`).toBe(true);
}

describe("Instagram içerik: yorumcu/üçüncü kişi kimliği çıktıya geçmez", () => {
  it("enjekte edilmiş yorumcu, etiket, ortak yazar, anılan ve sponsor verisi çıktıda yok", () => {
    const result = normalizeContent(dirtyRow());
    if (!result.ok) throw new Error(result.reason);
    assertClean(result.value);
    // Kirli satırın normalize çıktısı temiz satırınkiyle AYNI: bu alanlar hiçbir alanı etkilemez.
    const clean = normalizeContent(reelRow());
    if (!clean.ok) throw new Error(clean.reason);
    // Kirli satırın çıktısı temiz satırınkiyle AYNI; tek fark herkese açık ortak yazar kullanıcı adı.
    expect(result).toEqual({ ok: true, value: { ...clean.value, coauthors: [COAUTHOR] } });
  });

  it("gerçek fixture'lar: hiçbir çıktı yasak alan taşımaz", () => {
    for (const name of ["reel", "posts.legacy"]) {
      for (const item of parseContent(loadFixture(name)).items) assertClean(item);
    }
  });

  it("çıktının tüm anahtarları (iç içe dahil) yasak listede değil", () => {
    const seen = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          seen.add(k);
          walk(v);
        }
      }
    };
    walk(parseContent([dirtyRow(), ...loadFixture("posts.legacy")]).items);
    for (const key of FORBIDDEN_KEYS) expect(seen.has(key), key).toBe(false);
  });
});

describe("Instagram profil: son gönderi listeleri ve yorumcu kimlikleri çıktıya geçmez", () => {
  it("latestPosts/latestIgtvVideos içindeki yorumcu ve etiketler okunmaz", () => {
    const row = {
      ...loadFixture("profile")[0],
      latestPosts: [{ id: "1", latestComments: [{ ownerUsername: COMMENTER, text: COMMENT_TEXT }], taggedUsers: [{ username: TAGGED }] }],
      latestIgtvVideos: [{ firstComment: COMMENT_TEXT, latestComments: [{ ownerUsername: COMMENTER }] }],
    };
    const result = normalizeProfile(row);
    if (!result.ok) throw new Error(result.reason);
    const json = JSON.stringify(result.value);
    for (const value of [COMMENTER, COMMENT_TEXT, TAGGED]) expect(json).not.toContain(value);
    for (const key of ["latestPosts", "latestIgtvVideos", "latestComments", "taggedUsers"]) expect(json).not.toContain(key);
  });
});
