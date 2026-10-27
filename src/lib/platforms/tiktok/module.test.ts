import { describe, expect, it } from "vitest";

import { isAddablePlatform } from "@/components/competitors/add-config";
import { parseHandle } from "@/components/competitors/handle";
import { estimateCost, fallbackUnitPriceOf, FALLBACK_UNIT_PRICE_USD } from "@/lib/apify/pricing";
import { isValidPlatformHandle, parseHandleInput } from "@/lib/data/handle-input";
import { parseReelShortcode } from "@/lib/data/idea-link-input";
import { publishPlatformProblem } from "@/lib/data/publish-input";
import { rivalPlatformProblem } from "@/lib/domain/competitor";
import { analyzeVerdict } from "@/lib/job-runner/outcome-map";
import { analyzeSummary } from "@/lib/job-runner/test-support";
import { JOB_OUTCOME_PLAIN } from "@/lib/plain-language";
import { getPlatformModule, hasPlatformModule, listPlatformModules, supportsPublishing, supportsVideoInspection } from "@/lib/platforms/registry";
import { contentNoun, platformText } from "@/lib/platforms/text";
import { loadFixture } from "@/lib/platforms/tiktok/test-support";
import { ALLOWED_CDN_DOMAINS, isAllowedCdnHost } from "@/lib/video-analysis/download-url";

describe("TikTok modülü: kayıt ve sözleşme", () => {
  const tiktok = getPlatformModule("tiktok");

  it("kayıtlı ve herkese açık veri adaptörü tam; YouTube hâlâ kayıtsız", () => {
    expect(hasPlatformModule("tiktok")).toBe(true);
    expect(hasPlatformModule("youtube")).toBe(false);
    expect(listPlatformModules().map((module) => module.platform)).toEqual(["instagram", "tiktok"]);
    expect(tiktok.label).toBe("TikTok");
    for (const fn of ["normalizeHandle", "contentUrl", "buildProfileJob", "buildContentJob", "parseProfiles", "parseContent"] as const) {
      expect(typeof tiktok.publicData[fn], fn).toBe("function");
    }
    expect(tiktok.owned).toBeUndefined();
    expect(tiktok.publisher).toBeUndefined();
  });

  it("uçtan uca küçük duman: iş tanımı → ayrıştırma → bağlantı → oynatıcı", () => {
    const { publicData } = tiktok;
    expect(publicData.buildContentJob({ handle: "@Ornek.Hesap", limit: 3, includeTranscript: false }).actorId).toBe("clockworks/tiktok-scraper");
    const [video] = publicData.parseContent(loadFixture("videos")).items;
    expect(tiktok.parseContentUrl(video.url ?? "")).toEqual({ platform: "tiktok", shortcode: video.externalId, kind: "video" });
    expect(tiktok.embedUrl(video.url)).toBe(`https://www.tiktok.com/player/v1/${video.externalId}`);
    expect(tiktok.profileUrl("ornek.hesap")).toBe("https://www.tiktok.com/@ornek.hesap");
  });

  it("hesap araması tanımlı (isteğe bağlı arama)", () => {
    expect(tiktok.publicData.buildSearchJob).toBeTypeOf("function");
    expect(tiktok.publicData.parseSearch).toBeTypeOf("function");
  });
});

describe("TikTok'ta olmayan özellikler açıkça yok", () => {
  it("video incelemesi: indirme alan adı yok; hiçbir TikTok adresi indirme denetiminden geçmez", () => {
    expect(supportsVideoInspection("tiktok")).toBe(false);
    expect(supportsVideoInspection("instagram")).toBe(true);
    expect(supportsVideoInspection("youtube")).toBe(false);
    expect(ALLOWED_CDN_DOMAINS).toEqual(["cdninstagram.com", "fbcdn.net"]);
    for (const host of ["v19-webapp.tiktok.com", "v16m.tiktokcdn.com", "www.tiktok.com", "api.apify.com"]) expect(isAllowedCdnHost(host), host).toBe(false);
  });

  it("inceleme adımı `analysis_unsupported` ile ATLANIR (iş başarılı; müşteri cümlesi sözlükte)", () => {
    const verdict = analyzeVerdict(analyzeSummary({ outcome: "unsupported_platform", selected: 12, ok: 0 }));
    expect(verdict.step).toMatchObject({ status: "skipped", code: "analysis_unsupported" });
    expect(verdict.final).toMatchObject({ status: "succeeded", result: { outcome: "analysis_unsupported", exitCode: 0 } });
    expect(JOB_OUTCOME_PLAIN.analysis_unsupported).toMatch(/sayılara ve açıklamalara/);
  });

  it("yayın: TikTok'ta iş açılamaz, sebep Türkçe; Instagram'da engel yok", () => {
    expect(supportsPublishing("tiktok")).toBe(false);
    expect(publishPlatformProblem("tiktok")).toBe("TikTok için yayın henüz desteklenmiyor: bu platformda yayın işi açılamaz.");
    expect(publishPlatformProblem("instagram")).toBeUndefined();
  });
});

describe("platforma göre kurallar tek yerden", () => {
  it("yedek birim fiyat aktörün modülünden; sahipsiz aktörde genel varsayılan", () => {
    expect(fallbackUnitPriceOf("clockworks/tiktok-scraper")).toBe(0.0075);
    expect(fallbackUnitPriceOf("apify/instagram-reel-scraper")).toBe(FALLBACK_UNIT_PRICE_USD);
    expect(fallbackUnitPriceOf("baska/aktor")).toBe(FALLBACK_UNIT_PRICE_USD);
    expect(estimateCost(25, undefined, fallbackUnitPriceOf("clockworks/tiktok-scraper"))).toEqual({ amountUsd: 0.1875, unitPriceUsd: undefined, priceUnknown: true });
    // Yedek, bilinen en yüksek kademenin ($0,0037) üstünde kalmalı.
    expect(fallbackUnitPriceOf("clockworks/tiktok-scraper")).toBeGreaterThan(0.0037);
  });

  it("içerik türü adı ve alan örnekleri", () => {
    expect(contentNoun("instagram")).toBe("Reels");
    expect(contentNoun("tiktok")).toBe("video");
    expect(contentNoun("youtube")).toBe("video");
    expect(platformText("tiktok").handlePlaceholder).toContain("tiktok.com/@");
    expect(platformText("instagram").contentUrlPlaceholder).toBe("https://www.instagram.com/reel/…");
  });

  it("kullanıcı adı girdisi platformun kuralıyla ayrıştırılır", () => {
    expect(parseHandle("https://www.tiktok.com/@Kahve.Yeri?lang=tr", "tiktok")).toEqual({ ok: true, handle: "kahve.yeri" });
    expect(parseHandle("@kahve_yeri", "tiktok")).toEqual({ ok: true, handle: "kahve_yeri" });
    expect(parseHandle("kahve-yeri", "tiktok")).toEqual({ ok: false, reason: "invalid" });
    expect(parseHandle("https://www.instagram.com/kahve.yeri/", "tiktok")).toEqual({ ok: false, reason: "not_profile_url" });
    expect(parseHandle("https://www.tiktok.com/@kahve.yeri", "instagram")).toEqual({ ok: false, reason: "not_profile_url" });
    expect(parseHandle("   ", "tiktok")).toEqual({ ok: false, reason: "empty" });
    // Platform verilmeden (henüz seçilmemiş) genel temizlik: eski davranış.
    expect(parseHandle("https://www.tiktok.com/@Kahve.Yeri")).toEqual({ ok: true, handle: "kahve.yeri" });
  });

  it("depo girdisi: TikTok'ta geçersiz ad reddedilir, Instagram kuralı değişmez", () => {
    expect(parseHandleInput("tiktok", " @Kahve.Yeri ")).toBe("kahve.yeri");
    expect(() => parseHandleInput("tiktok", "kahve-yeri")).toThrow(/Geçersiz kullanıcı adı/);
    expect(parseHandleInput("instagram", "kahve-yeri")).toBe("kahve-yeri");
    expect(isValidPlatformHandle("tiktok", "a".repeat(25))).toBe(false);
    expect(isValidPlatformHandle("instagram", "a".repeat(25))).toBe(true);
    expect(isValidPlatformHandle("youtube", "kanal-adi")).toBe(true); // modül yok: yalnız genel kural
  });

  it("rakip ekleme TikTok için açık; rakip kendi hesapla aynı platformdan olmalı", () => {
    expect(isAddablePlatform("tiktok")).toBe(true);
    expect(isAddablePlatform("youtube")).toBe(false);
    expect(rivalPlatformProblem(["tiktok"], "tiktok")).toBeUndefined();
    expect(rivalPlatformProblem(["tiktok"], "instagram")).toBe("Rakip, kendi hesabınla aynı platformdan olmalı.");
  });

  it("fikir ↔ video bağı: TikTok bağlantısı kimliğe çözülür, başka platformun bağlantısı reddedilir", () => {
    expect(parseReelShortcode("tiktok", "https://www.tiktok.com/@ornek.hesap/video/7500000000000000001?lang=tr")).toBe("7500000000000000001");
    expect(() => parseReelShortcode("tiktok", "https://www.instagram.com/reel/DAbCdEfGhIj/")).toThrow(/Geçerli bir TikTok içerik bağlantısı yapıştır \(tiktok\.com/);
    expect(() => parseReelShortcode("tiktok", "https://vm.tiktok.com/ZMabcdef/")).toThrow(/kısa paylaşım bağlantısı olmaz/);
    expect(() => parseReelShortcode("instagram", "https://www.tiktok.com/@a/video/7500000000000000001")).toThrow(/Reels ya da gönderi adresi/);
  });
});
