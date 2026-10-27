/**
 * Örnek verinin TikTok çeşidi (`MockRepositoryOptions.platform`; ortamda `MOCK_PLATFORM=tiktok`): ekranların TikTok hesabında gezilebildiği
 * ve hattın platform kurallarına uyduğu (tek platform, doğru izlenme türü, yayın yok, rakip aynı platformdan) sınanır.
 */
import { describe, expect, it } from "vitest";

import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { getPlatformModule } from "@/lib/platforms/registry";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const tiktokRepo = (onboarding?: { start: "add_account" | "review_account" | "choose_rivals" }) => createMockRepository(undefined, { platform: "tiktok", ...(onboarding ? { onboarding } : {}) });

describe("örnek veri: TikTok çeşidi", () => {
  it("tek kendi hesap (TikTok, resmi API bağlı değil) ve bütün rakipler TikTok'ta", async () => {
    const repo = tiktokRepo();
    const own = await repo.listOwnAccounts(WS);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ platform: "tiktok", connection: "scrape_only", scopes: [] });
    const rivals = await repo.listCompetitors(WS, {});
    expect(rivals.length).toBeGreaterThan(5);
    expect(new Set(rivals.map((rival) => rival.platform))).toEqual(new Set(["tiktok"]));
  });

  it("bütün içerik TikTok: izlenme türü karışmaz, bağlantı modülle çözülür ve resmi oynatıcıya çevrilir", async () => {
    const repo = tiktokRepo();
    const tiktok = getPlatformModule("tiktok");
    const { items } = await repo.listContent(WS, { limit: MAX_PAGE_LIMIT });
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      expect(item.platform).toBe("tiktok");
      if (item.metrics.viewsKind !== undefined) expect(item.metrics.viewsKind).toBe("tt_play_count");
      expect(tiktok.parseContentUrl(item.url ?? "")?.shortcode, item.url).toBe(item.externalId);
    }
    const video = items.find((item) => item.format === "short_video");
    expect(tiktok.embedUrl(video?.url)).toBe(`https://www.tiktok.com/player/v1/${video?.externalId}`);
  });

  it("baz çizgisi / tutanlar ve haftalık plan TikTok verisiyle de üretilir", async () => {
    const repo = tiktokRepo();
    const { items } = await repo.listContent(WS, { limit: MAX_PAGE_LIMIT });
    expect(items.some((item) => item.score.lift !== undefined)).toBe(true);
    const plans = await repo.listWeeklyPlans(WS);
    expect(plans.length).toBeGreaterThan(0);
    const plan = await repo.getWeeklyPlan(WS, plans[0].weekStart);
    expect(plan).toMatchObject({ platform: "tiktok" });
    expect(plan?.items.length).toBeGreaterThan(0);
    const ideas = await repo.listIdeas(WS, { limit: MAX_PAGE_LIMIT });
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.every((idea) => idea.platform === "tiktok")).toBe(true);
  });

  it("yayın yok: tohumda iş yok, yeni iş açık Türkçe sebeple reddedilir", async () => {
    const repo = tiktokRepo();
    expect(await repo.listPublishJobs(WS, {})).toEqual([]);
    const [account] = await repo.listOwnAccounts(WS);
    await expect(repo.createPublishJob(WS, { socialAccountId: account.id, caption: "deneme" })).rejects.toMatchObject({
      code: "invalid_state",
      message: "TikTok için yayın henüz desteklenmiyor: bu platformda yayın işi açılamaz.",
    });
  });

  it("rakip ekleme: TikTok adı kabul, TikTok'ta geçersiz ad ve başka platform reddedilir", async () => {
    const repo = tiktokRepo();
    expect(await repo.addCompetitor(WS, { platform: "tiktok", handle: "@Yeni.Rakip_1", status: "candidate" })).toMatchObject({ platform: "tiktok", handle: "yeni.rakip_1" });
    await expect(repo.addCompetitor(WS, { platform: "tiktok", handle: "yeni-rakip" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(repo.addCompetitor(WS, { platform: "instagram", handle: "yeni.rakip" })).rejects.toMatchObject({ code: "invalid_input", message: "Rakip, kendi hesabınla aynı platformdan olmalı." });
  });

  it("başlangıç akışı TikTok hesabıyla gezilir (MOCK_ONBOARDING ile birlikte)", async () => {
    const fresh = await tiktokRepo({ start: "add_account" }).getOnboardingState(WS);
    expect(fresh.step).toBe("add_account");
    const review = await tiktokRepo({ start: "review_account" }).getOnboardingState(WS);
    expect(review.step).toBe("review_account");
    expect(review.account).toMatchObject({ platform: "tiktok" });
    const rivals = await tiktokRepo({ start: "choose_rivals" }).getOnboardingState(WS);
    expect(rivals.step).toBe("choose_rivals");
  });

  it("varsayılan örnek veri değişmez (çeşit yalnız istenince)", async () => {
    const own = await createMockRepository().listOwnAccounts(WS);
    expect(own.map((account) => account.platform)).toEqual(["instagram", "tiktok"]);
  });
});
