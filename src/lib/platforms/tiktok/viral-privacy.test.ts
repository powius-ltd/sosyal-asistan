/**
 * Uyum testi (AGENTS.md şasi kuralları) — TikTok viral av: yorumcu, anılan, müzik sahibi, konum ve yazarın adı / kimliği / fotoğrafı /
 * biyografisi ayrıştırmada ATILIR. Kirli fixture satırına enjekte edilen değerlerin hiçbiri çıktıda geçmemeli.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseViral } from "@/lib/platforms/tiktok/viral-jobs";

const INJECTED = ["yorumcu.kisi_42", "gizli yorum metni 9f3a", "anilan.kisi", "muzik.sahibi_77", "Gizli Görünen Ad", "6911112222333344445", "MS4wLjABAAAA-gizli-sec-uid", "avatar-gizli-5c1e", "gizli biyografi 1a2b", "konum-gizli-88", "video-gizli-77", "muzik-gizli-31"];

describe("TikTok viral gizlilik", () => {
  const rows = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/apify/tiktok/viral-hashtag.json", import.meta.url)), "utf8")) as Record<string, unknown>[];
  // Kirli satır testte kurulur (fixture dosyaları üçüncü kişi alanı taşımaz: tiktok/privacy.test.ts).
  const clean = rows.find((r) => (r.authorMeta as { name?: string } | undefined)?.name === "temiz_yazar") as Record<string, unknown>;
  const dirty = {
    ...clean,
    authorMeta: { name: "temiz_yazar", fans: 3000, id: "6911112222333344445", nickName: "Gizli Görünen Ad", avatar: "https://p16-sign.example-cdn.test/avatar-gizli-5c1e", signature: "gizli biyografi 1a2b", secUid: "MS4wLjABAAAA-gizli-sec-uid" },
    mentions: ["@anilan.kisi"],
    detailedMentions: [{ id: "1", name: "anilan.kisi", nickName: "Gizli Görünen Ad" }],
    comments: [{ cid: "c1", text: "gizli yorum metni 9f3a", uniqueId: "yorumcu.kisi_42" }],
    commentsDatasetUrl: "https://api.apify.com/v2/datasets/yorumcu.kisi_42/items",
    musicMeta: { musicName: "original sound", musicAuthor: "muzik.sahibi_77", playUrl: "https://p16-sign.example-cdn.test/muzik-gizli-31" },
    locationMeta: { city: "konum-gizli-88" },
    mediaUrls: ["https://v16.example-cdn.test/video-gizli-77.mp4"],
  };
  const parsed = parseViral([...rows.filter((r) => r !== clean), dirty]);

  it("kirli satır gerçekten üçüncü kişi verisi taşıyor", () => {
    const text = JSON.stringify(dirty);
    for (const value of INJECTED) expect(text).toContain(value);
  });

  it("çıktıda enjekte edilen değerlerin hiçbiri yok; yalnız kullanıcı adı ve takipçi sayısı kalır", () => {
    const video = parsed.items.find((v) => v.authorHandle === "temiz_yazar");
    expect(video?.authorFollowers).toBe(3000);
    const text = JSON.stringify(parsed);
    for (const value of INJECTED) expect(text).not.toContain(value);
  });

  it("çıktı alanları izin listesindedir", () => {
    const allowed = new Set(["platform", "externalId", "url", "authorHandle", "authorFollowers", "views", "viewsKind", "likes", "comments", "shares", "publishedAt", "durationSec", "caption", "hashtags"]);
    for (const item of parsed.items) for (const key of Object.keys(item)) expect(allowed.has(key), key).toBe(true);
  });
});
