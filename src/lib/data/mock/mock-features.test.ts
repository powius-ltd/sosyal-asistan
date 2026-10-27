/**
 * Ek özellik mock verisi: hacim ve kurgu (koleksiyon, bildirim, hook kütüphanesi, uyum, en iyi saat).
 * Genel davranış sözleşmesi `repository.contract.ts`'tedir; burada yalnız mock'a özgü sayılar sınanır.
 */
import { describe, expect, it } from "vitest";

import { checkCompliance } from "@/lib/compliance";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/domain/notification";
import { buildMockDataset } from "@/lib/data/mock/generators/dataset";
import { createClock } from "@/lib/data/mock/mock-clock";
import { createMockRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const data = buildMockDataset(createClock());

describe("mock veri: koleksiyonlar", () => {
  it("3 koleksiyon, toplam 12 öğe; adlar benzersiz; bir içerik birden çok koleksiyonda; kendi içerik de var", () => {
    expect(data.collections).toHaveLength(3);
    expect(data.collectionItems).toHaveLength(12);
    expect(new Set(data.collections.map((c) => c.name)).size).toBe(3);
    const perContent = new Map<string, number>();
    for (const m of data.collectionItems) perContent.set(m.contentId, (perContent.get(m.contentId) ?? 0) + 1);
    expect([...perContent.values()].some((n) => n >= 2)).toBe(true);
    const own = new Set(data.content.filter((c) => c.owner.kind === "own").map((c) => c.id));
    expect(data.collectionItems.some((m) => own.has(m.contentId))).toBe(true);
    expect(data.collectionItems.some((m) => m.note)).toBe(true);
  });

  it("depo itemCount'ı üyelerden türetir", async () => {
    const list = await createMockRepository().listCollections(WS);
    expect(list.map((c) => c.itemCount).reduce((a, b) => a + b, 0)).toBe(12);
  });
});

describe("mock veri: bildirimler ve uyarı ayarları", () => {
  it("12 bildirim: 6 okunmamış, dört türün hepsi var; oluşturulma zamanı şimdiden sonra değil; okunma zamanı oluşmadan önce değil", () => {
    expect(data.notifications).toHaveLength(12);
    expect(data.notifications.filter((n) => n.readAt === undefined)).toHaveLength(6);
    // measurement_due ve idea_link_suggested SUNUCU olaylarıdır (toplama sonrası üretilir): mock tohumunda yalnız ilk dört tür var.
    expect(new Set(data.notifications.map((n) => n.kind))).toEqual(new Set(["competitor_outlier", "own_outlier", "weekly_digest", "system"]));
    const now = createClock().nowIso;
    for (const n of data.notifications) {
      expect(n.createdAt <= now, n.id).toBe(true);
      if (n.readAt) expect(n.readAt >= n.createdAt && n.readAt <= now, n.id).toBe(true);
    }
    const contentIds = new Set(data.content.map((c) => c.id));
    for (const n of data.notifications.filter((x) => x.kind === "competitor_outlier" || x.kind === "own_outlier")) {
      expect(contentIds.has(n.contentId ?? ""), n.id).toBe(true);
    }
  });

  it("varsayılan uyarı ayarları; her depo örneğinin ayarı kendine ait (yazma diğerini etkilemez)", async () => {
    expect(data.alertSettings).toEqual(DEFAULT_ALERT_SETTINGS);
    const a = createMockRepository();
    await a.updateAlertSettings(WS, { weeklyDigest: { hour: 18 } });
    expect((await createMockRepository().getAlertSettings(WS)).weeklyDigest.hour).toBe(DEFAULT_ALERT_SETTINGS.weeklyDigest.hour);
  });
});

describe("mock veri: hook kütüphanesi", () => {
  it("ok + doğrulanmış analizlerden türer: yeterli giriş, birden çok hook türü, kendi ve rakip girişler; doğrulanmamış/başarısız analiz girmez", async () => {
    const repo = createMockRepository();
    const { items, total } = await repo.listHookLibrary(WS, { limit: 200 });
    const eligible = data.analyses.filter((a) => a.status === "ok" && a.evidenceVerified).length;
    expect(total).toBeGreaterThanOrEqual(15);
    expect(total, "ignored/aday rakip girişleri hariç olabilir").toBeLessThanOrEqual(eligible);
    expect(new Set(items.map((e) => e.hookType)).size).toBeGreaterThanOrEqual(3);
    expect(items.some((e) => e.isOwn) && items.some((e) => !e.isOwn)).toBe(true);
    const excluded = new Set(data.analyses.filter((a) => a.status !== "ok" || !a.evidenceVerified).map((a) => a.contentItemId));
    expect(items.some((e) => excluded.has(e.contentId))).toBe(false);
    expect((await repo.hookTypeStats(WS)).length).toBeGreaterThanOrEqual(3);
  });
});

describe("mock veri: yayın uyumu", () => {
  const verdict = (job: (typeof data.publishJobs)[number]) =>
    checkCompliance({
      caption: job.caption ?? "",
      isPaidPartnership: job.paidPartnership,
      isAiGenerated: job.aiGenerated,
      advertiserName: job.advertiserName,
      region: data.workspace.complianceRegion,
    });

  it("varsayılan bölge TR; işlerin bir kısmı ücretli iş birliği / YZ işaretli / Trial Reels", () => {
    expect(data.workspace.complianceRegion).toBe("TR");
    expect(data.publishJobs.filter((j) => j.paidPartnership).length).toBeGreaterThanOrEqual(2);
    expect(data.publishJobs.filter((j) => j.aiGenerated).length).toBeGreaterThanOrEqual(2);
    expect(data.publishJobs.filter((j) => j.trial?.enabled).map((j) => j.trial?.graduation).sort()).toEqual(["manual", "performance"]);
    expect(data.publishJobs.some((j) => j.advertiserName)).toBe(true);
  });

  it("onay bekleyen tek iş uyumda fail (hem warn hem fail bulgusu var); taslak da fail; onaylanmış ve sonrası işler fail değil", () => {
    const awaiting = data.publishJobs.filter((j) => j.status === "awaiting_approval");
    expect(awaiting.map((j) => verdict(j).status)).toEqual(["fail"]);
    expect(new Set(verdict(awaiting[0]).findings.map((f) => f.severity))).toEqual(new Set(["warn", "fail"]));
    expect(data.publishJobs.filter((j) => j.status === "draft").map((j) => verdict(j).status)).toEqual(["fail"]);
    for (const j of data.publishJobs.filter((x) => x.approvedAt)) expect(verdict(j).status, j.id).not.toBe("fail");
    // Uyumlu işler (ibare + reklam veren / YZ beyanı) ok.
    expect(data.publishJobs.filter((j) => j.advertiserName).map((j) => verdict(j).status)).toEqual(["ok"]);
  });

  it("depo: seed'deki fail'deki onay bekleyen iş onaylanamaz, bölgeyi değiştirmek seed'i düzeltmez", async () => {
    const repo = createMockRepository();
    const [job] = await repo.listPublishJobs(WS, { status: "awaiting_approval" });
    await expect(repo.approvePublishJob(WS, job.id)).rejects.toMatchObject({ code: "invalid_state" });
    await repo.updateWorkspace(WS, { complianceRegion: "US" });
    await expect(repo.approvePublishJob(WS, job.id)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await repo.listPublishJobs(WS, { status: "awaiting_approval" })).map((j) => j.id)).toEqual([job.id]);
  });
});

describe("mock veri: en iyi paylaşım saatleri", () => {
  it("genel bakışta bağlı hesap için 3 dilim (her biri ≥3 paylaşım); verisi seyrek TikTok hesabında undefined + sebep", async () => {
    const repo = createMockRepository();
    const overall = await repo.getOverview(WS);
    expect(overall.bestTimes).toHaveLength(3);
    expect(overall.bestTimes?.every((t) => t.n >= 3 && t.medianViews !== undefined)).toBe(true);
    const tiktok = data.ownAccounts.find((a) => a.platform === "tiktok");
    const scoped = await repo.getOverview(WS, { accountId: tiktok?.id });
    expect(scoped.bestTimes ?? []).not.toHaveLength(3);
    if (scoped.bestTimes === undefined) expect(scoped.bestTimesUnmeasuredReason).toMatch(/en az 3 video/);
  });
});

describe("mock: Zernio'da zamanlanmış gönderi iptali (K2)", () => {
  it("container_id dolu ready satır iptal edilemez (invalid_state); canCancel dolu containerId'de false", async () => {
    const { canCancel } = await import("@/lib/domain/publish");
    expect(canCancel("ready", "z-post-1")).toBe(false);
    expect(canCancel("failed", "z-post-1")).toBe(true);
    expect(canCancel("approved")).toBe(true);
    const repo = createMockRepository();
    const withContainer = (await repo.listPublishJobs(WS, {})).find((j) => j.containerId && j.status === "ready");
    expect(withContainer).toBeDefined();
    await expect(repo.cancelPublishJob(WS, withContainer!.id)).rejects.toMatchObject({ code: "invalid_state" });
  });
});
