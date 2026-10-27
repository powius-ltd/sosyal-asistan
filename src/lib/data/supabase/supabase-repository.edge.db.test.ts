/**
 * Supabase deposu · sözleşme süitinin KAPSAMADIĞI davranışlar (entegrasyon): imleçli sayfalamanın tüm sıralarda (NULL sıralama
 * anahtarı dahil) küçük sayfalarla tam ve sıralı gezilmesi, GERÇEK ikinci workspace ile kiracı yalıtımı, biçimsiz kimlik/imleç,
 * arama özel karakterleri, bütçe reddinde telafi ve onaylayan üyelik denetimi. İki AYRI test workspace'i kurar/siler.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import type { PanelRepository } from "@/lib/data/repository";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { deleteContractWorkspace, seedContractWorkspace } from "@/lib/data/supabase/testing/contract-seed";
import { resolveDbTestEnv } from "@/lib/data/supabase/testing/db-env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

const status = await resolveDbTestEnv();
const wsA = randomUUID();
const wsB = randomUUID();
const label = status.env ? "supabase · kenar durumları" : `supabase · kenar durumları (ATLANDI: ${status.skipReason})`;

/** Tüm sayfaları küçük sayfa boyuyla gezer; tekrar/atlama olursa `allPages` benzeri açıkça hata verir. */
async function walk<T extends { id: string }>(fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 300; i++) {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) return all;
  }
  throw new Error("sayfalama bitmedi");
}

describe.skipIf(!status.env)(label, { timeout: 180_000 }, () => {
  const env = status.env;
  const db = createClient<Database>(env?.url ?? "http://127.0.0.1", env?.serviceRoleKey ?? "atlandi", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as AdminClient;
  const repo: PanelRepository = createSupabaseRepository({ db, approverUserId: env?.userId ?? randomUUID() });

  beforeAll(async () => {
    if (!env) return;
    await seedContractWorkspace(db, wsA, env.userId, new Date());
    await seedContractWorkspace(db, wsB, env.userId, new Date());
    // NULL sıralama anahtarları: yayın tarihi ve lift bilinmeyen içerik (sıralamada sona düşer, imleçte NULL dalı çalışır).
    const [competitor] = (await repo.listCompetitors(wsA, { status: "tracked" })).slice(0, 1);
    const [account] = await repo.listOwnAccounts(wsA);
    const rows = [
      { competitor_id: competitor.id, social_account_id: null, external_id: "null-anahtar-1", platform: competitor.platform },
      { competitor_id: competitor.id, social_account_id: null, external_id: "null-anahtar-2", platform: competitor.platform },
      { competitor_id: null, social_account_id: account.id, external_id: "null-anahtar-3", platform: account.platform },
    ].map((r) => ({ ...r, workspace_id: wsA, format: "short_video" as const, caption: "Tarihsiz içerik 100% _ \"tırnak\", (parantez)" }));
    // Aynı (mikrosaniye hassasiyetli) yayın zamanı: imleçte eşitlik dalı (`id` ile ayrım) çalışır.
    const tied = Array.from({ length: 5 }, (_, i) => ({
      competitor_id: competitor.id,
      social_account_id: null,
      platform: competitor.platform,
      external_id: `esit-zaman-${i}`,
      workspace_id: wsA,
      format: "short_video" as const,
      published_at: "2026-01-01T00:00:00.123456+00:00",
      caption: "Eşit zamanlı içerik",
    }));
    const { error } = await db.from("content_items").insert([...rows, ...tied]);
    if (error) throw new Error(error.message);
  }, 120_000);

  afterAll(async () => {
    if (!env) return;
    await deleteContractWorkspace(db, wsA);
    await deleteContractWorkspace(db, wsB);
  }, 60_000);

  it("içerik: her sıralama küçük sayfalarla tam, tekrarsız ve büyük sayfayla AYNI sırada gezilir (NULL anahtarlar sonda)", async () => {
    for (const sort of ["recent", "lift", "views"] as const) {
      const big = (await repo.listContent(wsA, { sort, limit: 200 })).items;
      const small = await walk((cursor) => repo.listContent(wsA, { sort, limit: 3, cursor }));
      expect(small.map((c) => c.id), sort).toEqual(big.map((c) => c.id));
      expect(new Set(small.map((c) => c.id)).size, sort).toBe(small.length);
      const total = (await repo.listContent(wsA, { sort, limit: 1 })).total;
      expect(total, `${sort}: toplam`).toBe(big.length);
    }
    const byRecent = (await repo.listContent(wsA, { sort: "recent", limit: 200 })).items;
    const firstNull = byRecent.findIndex((c) => c.publishedAt === undefined);
    expect(byRecent.filter((c) => c.publishedAt === "2026-01-01T00:00:00.123Z").length, "eşit zamanlı içerikler").toBe(5);
    expect(firstNull, "tarihsiz içerik var").toBeGreaterThanOrEqual(0);
    expect(byRecent.slice(firstNull).every((c) => c.publishedAt === undefined), "tarihsizler sonda").toBe(true);
    const byLift = (await repo.listContent(wsA, { sort: "lift", limit: 200 })).items;
    const firstUnmeasured = byLift.findIndex((c) => c.score.lift === undefined);
    expect(byLift.slice(firstUnmeasured).every((c) => c.score.lift === undefined), "ölçülemeyen lift sonda").toBe(true);
  });

  it("tutanlar: lift / cross / recent sıraları küçük sayfalarla büyük sayfayla aynı; filtreli imleç de tam", async () => {
    for (const sort of ["lift", "cross", "recent"] as const) {
      const big = (await repo.listOutliers(wsA, { sort, limit: 200, minTier: 1 })).items;
      const small = await walk((cursor) => repo.listOutliers(wsA, { sort, limit: 2, minTier: 1, cursor }));
      expect(small.map((c) => c.id), sort).toEqual(big.map((c) => c.id));
      expect(big.length, `${sort}: veri var`).toBeGreaterThan(2);
      expect((await repo.listOutliers(wsA, { sort, limit: 1, minTier: 1 })).total, `${sort}: toplam`).toBe(big.length);
    }
  });

  it("imleç sıralamaya bağlıdır: başka sıralamanın ya da bozuk imleç invalid_input", async () => {
    const page = await repo.listContent(wsA, { sort: "recent", limit: 2 });
    expect(page.nextCursor).toBeDefined();
    await expect(repo.listContent(wsA, { sort: "lift", limit: 2, cursor: page.nextCursor })).rejects.toMatchObject({ code: "invalid_input" });
    for (const cursor of ["!!!", "e30", Buffer.from("[1,2]").toString("base64url")]) {
      await expect(repo.listContent(wsA, { cursor })).rejects.toMatchObject({ code: "invalid_input" });
      await expect(repo.listNotifications(wsA, { cursor })).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("arama: özel karakterler (% _ \" , ( )) SQL/filtre sözdizimini bozmaz; handle Türkçe katlamayla, tarihsiz içerik alt yazıyla bulunur", async () => {
    for (const term of ["100%", "_ \"tırnak\"", "(parantez)", "tırnak\", (par", "'; drop table x; --"]) {
      const found = await repo.listContent(wsA, { search: term, limit: 50 });
      if (term === "'; drop table x; --") expect(found.items).toEqual([]);
      else expect(found.items.length, term).toBeGreaterThan(0);
    }
    expect((await repo.listContent(wsA, { search: "RAKIP.BIR" })).items.length).toBeGreaterThan(0);
    expect((await repo.listContent(wsA, { search: "tarihsiz içerik" })).items.every((c) => c.caption?.includes("Tarihsiz"))).toBe(true);
    expect((await repo.listCompetitors(wsA, { search: "RAKİP.İKİ" })).map((c) => c.handle)).toContain("rakip.iki");
  });

  it("kiracı yalıtımı: başka (GERÇEK) workspace'in kaydı okunmaz, yazılmaz, listelerde görünmez", async () => {
    const [contentB] = (await repo.listContent(wsB, { limit: 1 })).items;
    const [competitorB] = await repo.listCompetitors(wsB);
    const [ideaB] = await repo.listIdeas(wsB);
    const [jobB] = await repo.listPublishJobs(wsB, { status: "draft" });
    const [collectionB] = await repo.listCollections(wsB);
    const [notificationB] = (await repo.listNotifications(wsB)).items;
    const [accountA] = await repo.listOwnAccounts(wsA);
    const [contentA] = (await repo.listContent(wsA, { limit: 1 })).items;

    // Okuma: A üzerinden B'nin kimliği bulunamaz.
    expect(await repo.getContent(wsA, contentB.id)).toBeNull();
    expect(await repo.getIdea(wsA, ideaB.id)).toBeNull();
    expect(await repo.getCollection(wsA, collectionB.id)).toBeNull();
    expect(await repo.listCollectionsForContent(wsA, contentB.id)).toEqual([]);
    expect(await repo.listCollectionMembership(wsA, [contentB.id])).toEqual({ [contentB.id]: [] });
    expect((await repo.listContent(wsA, { ownerId: competitorB.id })).items).toEqual([]);
    expect((await repo.listOutliers(wsA, { competitorId: competitorB.id })).items).toEqual([]);
    const idsA = new Set((await repo.listCompetitors(wsA)).map((c) => c.id));
    expect(idsA.has(competitorB.id)).toBe(false);

    // Yazma: A üzerinden B'nin kaydı değiştirilemez, B'nin kaydına bağlanamaz.
    await expect(repo.setCompetitorStatus(wsA, competitorB.id, "ignored")).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.updateIdeaStatus(wsA, ideaB.id, "dismissed")).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.cancelPublishJob(wsA, jobB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.submitPublishJob(wsA, jobB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.approvePublishJob(wsA, jobB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.markNotificationRead(wsA, notificationB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.renameCollection(wsA, collectionB.id, "Çalınan")).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.deleteCollection(wsA, collectionB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.addToCollection(wsA, collectionB.id, contentA.id)).rejects.toMatchObject({ code: "not_found" });
    const [collectionA] = await repo.listCollections(wsA);
    await expect(repo.addToCollection(wsA, collectionA.id, contentB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.createPublishJob(wsA, { socialAccountId: accountA.id, ideaId: ideaB.id })).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.removeFromCollection(wsA, collectionB.id, contentB.id)).rejects.toMatchObject({ code: "not_found" });

    // B'nin verisi etkilenmedi.
    expect((await repo.getCollection(wsB, collectionB.id))?.collection.name).toBe(collectionB.name);
    expect((await repo.getIdea(wsB, ideaB.id))?.status).toBe(ideaB.status);
    expect((await repo.listPublishJobs(wsB, { status: "draft" })).map((j) => j.id)).toContain(jobB.id);
    // Okundu işareti yalnız kendi workspace'ini etkiler.
    const unreadB = await repo.countUnreadNotifications(wsB);
    await repo.markAllNotificationsRead(wsA);
    expect(await repo.countUnreadNotifications(wsB)).toBe(unreadB);
  });

  it("biçimsiz zaman parametresi Postgres'e gitmez: invalid_input", async () => {
    await expect(repo.listContent(wsA, { since: "dün" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(repo.listOutliers(wsA, { since: "dün" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(repo.listRuns(wsA, { since: "dün" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(repo.listPublishJobs(wsA, { from: "yarın" })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("biçimsiz (UUID olmayan) kimlikler hata değil 'bulunamadı' verir", async () => {
    expect(await repo.getContent(wsA, "abc")).toBeNull();
    expect(await repo.getIdea(wsA, "abc")).toBeNull();
    expect(await repo.getCollection(wsA, "abc")).toBeNull();
    expect(await repo.getWorkspace("ws_mock_1")).toBeNull();
    expect((await repo.listContent(wsA, { ownerId: "abc" })).items).toEqual([]);
    expect(await repo.listCollectionMembership(wsA, ["abc", "ci_1"])).toEqual({ abc: [], ci_1: [] });
    await expect(repo.setCompetitorStatus(wsA, "abc", "ignored")).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.cancelPublishJob(wsA, "abc")).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.markNotificationRead(wsA, "abc")).rejects.toMatchObject({ code: "not_found" });
    expect(await repo.listPublishJobs(wsA, { socialAccountId: "abc" })).toEqual([]);
    expect(await repo.listOwnAccounts("ws_mock_1")).toEqual([]);
  });

  it("bütçe reddi: rakip EKLENMEZ (telafi silmesi), tavan uygun olunca ekleme Apify profil koşusu rezerve eder", async () => {
    const before = await repo.getWorkspace(wsA);
    if (!before) throw new Error("workspace yok");
    const handle = `butce.${Date.now().toString(36)}`;
    try {
      await repo.updateWorkspace(wsA, { apifyMonthlyCapUsd: 0 });
      await expect(repo.addCompetitor(wsA, { platform: "instagram", handle })).rejects.toMatchObject({ code: "budget_exceeded" });
      expect((await repo.listCompetitors(wsA, { search: handle })), "reddedilen rakip kalmadı").toEqual([]);
    } finally {
      await repo.updateWorkspace(wsA, { apifyMonthlyCapUsd: before.apifyMonthlyCapUsd });
    }
    const costBefore = await repo.getCostSummary(wsA);
    const added = await repo.addCompetitor(wsA, { platform: "instagram", handle });
    expect(added).toMatchObject({ handle, status: "tracked", contentCount: 0 });
    const costAfter = await repo.getCostSummary(wsA);
    expect(costAfter.apify.runs).toBe(costBefore.apify.runs + 1);
    expect(costAfter.apify.committedUsd).toBeCloseTo(costBefore.apify.committedUsd + 0.015, 4);
    const runs = (await repo.listRuns(wsA, { provider: "apify", limit: 200 })).items;
    expect(runs.some((r) => r.targetLabel === `@${handle}` && r.kind === "profile" && r.status === "reserved" && r.reservedUsd === 0.015)).toBe(true);
    await expect(repo.addCompetitor(wsA, { platform: "instagram", handle: handle.toUpperCase() })).rejects.toMatchObject({ code: "already_exists" });
    // Tekrar eklemenin çift rezerve etmediği: yalnız ilk ekleme koşu açtı.
    expect((await repo.getCostSummary(wsA)).apify.runs).toBe(costAfter.apify.runs);
  });

  it("yayın onayı: onaylayan üye (editör/sahip) değilse DB trigger'ı reddeder → invalid_state; onay kaydı yazılmaz", async () => {
    const stranger = createSupabaseRepository({ db, approverUserId: randomUUID() });
    const [account] = (await repo.listOwnAccounts(wsA)).filter((a) => a.connection === "connected");
    const job = await repo.createPublishJob(wsA, { socialAccountId: account.id, caption: "Onay denemesi", status: "awaiting_approval" });
    try {
      await expect(stranger.approvePublishJob(wsA, job.id)).rejects.toMatchObject({ code: "invalid_state" });
      const stuck = (await repo.listPublishJobs(wsA, { status: "awaiting_approval" })).find((j) => j.id === job.id);
      expect([stuck?.status, stuck?.approvedAt, stuck?.approvedBy]).toEqual(["awaiting_approval", undefined, undefined]);
    } finally {
      await repo.cancelPublishJob(wsA, job.id);
    }
  });

  it("yayın işleri: takvim sırası (planlı/plansız birleşik) ve from/to aralığı", async () => {
    const jobs = await repo.listPublishJobs(wsA, { limit: 200 });
    const key = (j: { scheduledFor?: string; createdAt: string }) => new Date(j.scheduledFor ?? j.createdAt).getTime();
    expect(jobs.map(key)).toEqual([...jobs.map(key)].sort((a, b) => b - a));
    const mid = key(jobs[Math.floor(jobs.length / 2)]);
    const from = new Date(mid).toISOString();
    const ranged = await repo.listPublishJobs(wsA, { from, limit: 200 });
    expect(ranged.every((j) => key(j) >= mid)).toBe(true);
    expect(ranged.map((j) => j.id)).toEqual(jobs.filter((j) => key(j) >= mid).map((j) => j.id));
    const small = await repo.listPublishJobs(wsA, { limit: 2 });
    expect(small.map((j) => j.id)).toEqual(jobs.slice(0, 2).map((j) => j.id));
  });

  it("içerik/tutan öğeleri: skor önbelleği okunur (yeniden hesaplanmaz), hasTranscript/analysisStatus gömülü ilişkiden gelir", async () => {
    const items: ContentItem[] = await walk((cursor) => repo.listContent(wsA, { limit: 25, cursor }));
    expect(items.some((c) => c.hasTranscript)).toBe(true);
    expect(items.some((c) => c.analysisStatus === "ok")).toBe(true);
    expect(items.some((c) => c.analysisStatus === "failed" || c.analysisStatus === "insufficient_data")).toBe(true);
    expect(items.some((c) => !c.hasTranscript && c.analysisStatus === undefined)).toBe(true);
    const own = await repo.getContent(wsA, items.find((c) => c.analysisStatus === "ok" && c.owner.kind === "own")?.id ?? "");
    expect(own?.snapshots.length).toBeGreaterThan(1);
    expect(own?.transcript?.source).toBe("gemini");
    expect(own?.transcript?.expiresAt, "kendi transcript'i süresiz").toBeUndefined();
    const rival = await repo.getContent(wsA, items.find((c) => c.analysisStatus === "ok" && c.owner.kind === "competitor")?.id ?? "");
    expect(rival?.transcript?.source).toBe("apify");
    expect(rival?.transcript?.expiresAt, "rakip transcript'i 90 gün").toBeDefined();
  });

  it("brifing: en yenisi okunur, biçimi bozuk yeni satır atlanır (önceki geçerli kalır), başka workspace'inki görünmez", async () => {
    const seeded = await repo.getLatestBriefing(wsA);
    expect(seeded?.id).toBeDefined();
    const base = { workspace_id: wsA, agent: "analyst", basis: {}, prompt_version: "edge", persona_version: "edge" };
    const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    // Biçimi bozuk (tablo check'ini geçer, zod'u geçmez): sürüm yok, madde eksik alanlı.
    const broken = await db.from("agent_briefings").insert({ ...base, generated_at: future(10), payload: { items: [{ kind: "worked" }] } }).select("id").single();
    expect(broken.error).toBeNull();
    expect((await repo.getLatestBriefing(wsA))?.id, "bozuk satır atlanır").toBe(seeded?.id);
    const ok = {
      schemaVersion: 1,
      items: [{ kind: "pending", headline: "Edge", body: "Edge metni.", evidence: ["plan:2026-09-28"], confidence: "low" }],
    };
    const newer = await db.from("agent_briefings").insert({ ...base, generated_at: future(20), payload: ok, basis: { analyzedCount: 0, labeledCount: 0 } }).select("id").single();
    expect(newer.error).toBeNull();
    const latest = await repo.getLatestBriefing(wsA);
    expect(latest?.id, "en yeni geçerli satır").toBe(newer.data?.id);
    expect(latest?.basis, "ölçülemeyen alanlar yok (0 değil, undefined)").toEqual({ analyzedCount: 0, labeledCount: 0 });
    expect((await repo.getLatestBriefing(wsB))?.id, "B kendi brifingini görür, A'nınkini değil").not.toBe(latest?.id);
  });
});
