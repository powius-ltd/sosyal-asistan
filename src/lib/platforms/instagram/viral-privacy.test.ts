/**
 * Uyum testi (AGENTS.md şasi kuralları) — Instagram viral av: yorumcu, etiketlenen / anılan, ortak yazar, yazarın adı / kimliği ve medya
 * adresleri ayrıştırmada ATILIR. Kirli fixture satırına (VR0007) enjekte edilen değerlerin hiçbiri çıktıda geçmemeli.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseViral } from "@/lib/platforms/instagram/viral-jobs";

const INJECTED = ["yorumcu.kisi_42", "gizli yorum metni 9f3a", "etiketlenen.kisi", "Etiket Adı", "anilan.kisi", "ortak.yazar_9", "Gizli Görünen Ad", "41546774605", "1029649300", "konum-gizli-88", "video-gizli-77", "kapak-gizli-31", "etiket-gizli-5c1e", "muzik-gizli-12"];

describe("Instagram viral gizlilik", () => {
  const rows = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/apify/instagram/viral-hashtag.json", import.meta.url)), "utf8")) as Record<string, unknown>[];
  // Kirli satır testte kurulur (fixture dosyaları üçüncü kişi alanı taşımaz: boundary.test.ts).
  const dirty = {
    ...rows.find((r) => r.shortCode === "VR0007"),
    ownerFullName: "Gizli Görünen Ad",
    ownerId: "41546774605",
    firstComment: "gizli yorum metni 9f3a",
    latestComments: [{ ownerUsername: "yorumcu.kisi_42", text: "gizli yorum metni 9f3a", id: "c1" }],
    taggedUsers: [{ username: "etiketlenen.kisi", full_name: "Etiket Adı", id: "1029649300", profile_pic_url: "https://scontent.example-cdn.test/etiket-gizli-5c1e" }],
    mentions: ["anilan.kisi"],
    coauthorProducers: [{ username: "ortak.yazar_9", id: "8812" }],
    locationName: "konum-gizli-88",
    videoUrl: "https://scontent.example-cdn.test/video-gizli-77.mp4",
    displayUrl: "https://scontent.example-cdn.test/kapak-gizli-31.jpg",
    musicInfo: { audio_canonical_id: "muzik-gizli-12" },
  };
  const parsed = parseViral([...rows.filter((r) => r.shortCode !== "VR0007"), dirty]);
  const video = parsed.items.find((v) => v.externalId === "VR0007");

  it("kirli satır gerçekten üçüncü kişi verisi taşıyor (testin kendisi boş değil)", () => {
    const text = JSON.stringify(dirty);
    for (const value of INJECTED) expect(text).toContain(value);
  });

  it("çıktıda enjekte edilen değerlerin hiçbiri yok; yalnız yazarın herkese açık kullanıcı adı kalır", () => {
    expect(video?.authorHandle).toBe("temiz_yazar");
    const text = JSON.stringify(parsed);
    for (const value of INJECTED) expect(text).not.toContain(value);
  });

  it("çıktı alanları izin listesindedir (ham nesne yayılmaz)", () => {
    const allowed = new Set(["platform", "externalId", "url", "authorHandle", "authorFollowers", "views", "viewsKind", "likes", "comments", "shares", "publishedAt", "durationSec", "caption", "hashtags"]);
    for (const item of parsed.items) for (const key of Object.keys(item)) expect(allowed.has(key), key).toBe(true);
  });
});
