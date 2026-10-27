import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildViralJob, INSTAGRAM_VIRAL_ACTOR, parseViral } from "@/lib/platforms/instagram/viral-jobs";
import { instagramModule } from "@/lib/platforms/instagram";

function fixture(): Record<string, unknown>[] {
  return JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/apify/instagram/viral-hashtag.json", import.meta.url)), "utf8")) as Record<string, unknown>[];
}

describe("Instagram viral iş tanımı", () => {
  it("hashtag aktörü, yalnız Reels, anahtar sözcük araması, sorgu başına sınır", () => {
    const job = buildViralJob({ query: "  #kahve demleme ", limit: 50 });
    expect(job.actorId).toBe(INSTAGRAM_VIRAL_ACTOR);
    expect(job.input).toEqual({ hashtags: ["kahve demleme"], keywordSearch: true, resultsType: "reels", resultsLimit: 50 });
    expect(job.expectedResults).toBe(50);
  });

  it("oturum / çerez / kimlik alanı yok; boş sorgu ve geçersiz sınır reddedilir", () => {
    const text = JSON.stringify(buildViralJob({ query: "kahve", limit: 5 }).input).toLowerCase();
    expect(text).not.toMatch(new RegExp(["ses"+"sion", "coo"+"kie", "password", "login", "token"].join("|")));
    expect(() => buildViralJob({ query: "  ", limit: 5 })).toThrow();
    expect(() => buildViralJob({ query: "kahve", limit: 0 })).toThrow(RangeError);
  });

  it("modül viral ucunu taşır; aktör yedek fiyat listesinde (fiyat okunamazsa genel varsayılana düşmez)", () => {
    const viral = instagramModule.publicData.viral;
    expect(viral?.followersInResult).toBe(false);
    expect(instagramModule.publicData.pricing.actorIds).toContain(INSTAGRAM_VIRAL_ACTOR);
  });
});

describe("Instagram viral ayrıştırma", () => {
  const result = parseViral(fixture());

  it("izlenme, tarih, yazar ve bağlantı olan satırlar öğedir; hata satırı ve yazarsız satır elenir", () => {
    expect(result.items.map((v) => v.externalId)).toEqual(["VR0001", "VR0002", "VR0003", "VR0004", "VR0007"]);
    expect(result.notItems).toHaveLength(2);
    expect(result.notItems.some((n) => n.reason.includes("yazar kullanıcı adı yok"))).toBe(true);
  });

  it("sayılar ve türü: oynatma önce, yoksa görüntüleme; takipçi bu sonuçta yok (undefined ≠ 0)", () => {
    const first = result.items[0];
    expect(first).toMatchObject({ platform: "instagram", authorHandle: "kucuk_hesap_a", views: 120000, viewsKind: "ig_play_count", likes: 4200, comments: 90, shares: 30, durationSec: 21.5 });
    expect(first.authorFollowers).toBeUndefined();
    expect(first.hashtags).toEqual(["kahve", "demleme", "evde"]);
    expect(first.url).toBe("https://www.instagram.com/reel/VR0001/");
    expect(first.publishedAt).toBe("2026-10-12T09:30:00.000Z");
  });

  it("gizli beğeni ve kapalı yorum yazılmaz (0 değil); kullanıcı adı küçük harfe iner; görüntüleme türü ayrı", () => {
    const hidden = result.items.find((v) => v.externalId === "VR0004");
    expect(hidden).toMatchObject({ authorHandle: "kucuk.hesap_d", views: 55000, viewsKind: "ig_view_count" });
    expect(hidden).not.toHaveProperty("likes");
    expect(hidden).not.toHaveProperty("comments");
    expect(hidden?.hashtags).toEqual(["kahve"]);
  });

  it("aynı içerik ikinci kez gelirse yalnız ilki alınır; 500 karakterden uzun açıklama kırpılır", () => {
    const row = fixture()[0];
    const parsed = parseViral([row, { ...row }, { ...row, shortCode: "VR9999", id: "9", caption: "ş".repeat(900) }]);
    expect(parsed.items.map((v) => v.externalId)).toEqual(["VR0001", "VR9999"]);
    expect(parsed.notItems[0].reason).toContain("tekrar");
    expect([...(parsed.items[1].caption ?? "")]).toHaveLength(500);
  });
});
