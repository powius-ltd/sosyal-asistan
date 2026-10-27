/**
 * Keşif hattı testleri: Apify SAHTE (ağ yok, para harcanmaz), veritabanı bellekte. Asıl kanıtlar: aday izlemeye alınmaz · tavan aşılacaksa
 * ücretli koşu HİÇ başlamaz · tavan sıfırken yalnız ücretsiz kaynaklar · modül aramayı desteklemiyorsa hata yok · bir kaynağın hatası
 * diğerini durdurmaz · yorumcu / etiket / kişi verisi aday satırına yazılmaz.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { BudgetExceededError } from "@/lib/apify/budget";
import { discoverCandidates } from "@/lib/collection/discover";
import { verifyOwnAccount } from "@/lib/collection/discover-account";
import { apifyHarness, fakeClient, memoryStore, NOW, WS } from "@/lib/collection/discover-test-support";
import { writeRelatedCandidates } from "@/lib/collection/discover-write";
import { createFakeLlm } from "@/lib/llm/backend-fake";
import { instagramPublicData } from "@/lib/platforms/instagram";
import { loadFixture } from "@/lib/platforms/instagram/test-support";

const client = fakeClient();
const HASHTAGS = [["yogadersi", "reels"], ["yogadersi", "nefescalismasi"], ["yogadersi"]];
const profileRow = (username: string, extra: Record<string, unknown> = {}) => ({ ...loadFixture("profile")[0], username, url: `https://www.instagram.com/${username}`, inputUrl: `https://www.instagram.com/${username}`, relatedProfiles: [], ...extra });
const searchRows = () => loadFixture("search");

afterEach(() => vi.restoreAllMocks());

describe("ücretsiz kaynaklar", () => {
  it("tavan 0: ortak yazarlar aday yazılır, hiçbir Apify koşusu başlamaz; aday izlemeye ALINMAZ", async () => {
    const store = memoryStore({ coauthors: [["ortak.bir", "kendi.hesap"], ["ortak.bir", "izlenen.rakip"], ["ortak.iki"]], hashtags: HASHTAGS, rivals: [{ id: "r1", platform: "instagram", handle: "izlenen.rakip", status: "tracked", source: "manual" }] });
    const h = apifyHarness();
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0, now: NOW }, { ...h.deps, store });

    expect(h.start).not.toHaveBeenCalled();
    expect(summary.outcome).toBe("completed");
    expect(summary.sources.coauthors).toEqual({ found: 4, written: 2 });
    expect(summary.sources.search).toEqual({ found: 0, written: 0, queries: [] });
    expect(summary.cost).toEqual({ reservedUsd: 0, pendingReconcile: 0 });
    expect(summary.candidates).toEqual({ total: 2 }); // takipçi bilinmiyor: benzer boy ölçülemedi (0 değil)
    expect(store.insertedRows.map((row) => [row.handle, row.status, row.source, row.discovered_via, row.followers])).toEqual([
      ["ortak.bir", "candidate", "related", "kendi.hesap", null],
      ["ortak.iki", "candidate", "related", "kendi.hesap", null],
    ]);
    expect(store.rivals.filter((rival) => rival.status === "tracked").map((rival) => rival.handle)).toEqual(["izlenen.rakip"]);
  });

  it("kendi hesap yoksa ya da platform modülü yoksa keşif boş döner (hata yok, koşu yok)", async () => {
    const h = apifyHarness();
    expect((await discoverCandidates({ client, workspaceId: WS, maxUsd: 1, now: NOW }, { ...h.deps, store: memoryStore({ own: [] }) })).outcome).toBe("no_account");
    const youtube = memoryStore({ own: [{ id: "o", platform: "youtube", handle: "kendi" }], coauthors: [["biri"]] });
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 1, now: NOW }, { ...h.deps, store: youtube });
    expect(summary).toMatchObject({ outcome: "unsupported", written: 0, candidates: { total: 0 } });
    expect(youtube.insertedRows).toEqual([]);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("TikTok: arama modülde var ama tavan verilmedi (maxUsd 0) → sorgu üretilmez, arama koşusu başlamaz; keşif hatasız tamamlanır", async () => {
    const h = apifyHarness();
    const tiktok = memoryStore({ own: [{ id: "o", platform: "tiktok", handle: "kendi" }], hashtags: [["kahve", "barista"]] });
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0, now: NOW }, { ...h.deps, store: tiktok });
    expect(summary).toMatchObject({ outcome: "completed", written: 0, sources: { search: { found: 0, written: 0, queries: [] } } });
    expect(h.start).not.toHaveBeenCalled();
  });

  it("niş eleği hata verirse keşif düşmez: aday yazımı sürer, nota yazılır (elek ücretsiz: Apify koşusu yok)", async () => {
    const h = apifyHarness();
    const store = memoryStore({ own: [{ id: "o", platform: "instagram", handle: "kendi" }], coauthors: [["ortak.hesap"]] });
    const summary = await discoverCandidates({ client: { from: () => { throw new Error("db yok"); } } as unknown as typeof client, workspaceId: WS, maxUsd: 0, now: NOW }, { ...h.deps, store, llm: createFakeLlm({ results: [] }).backend });
    expect(summary).toMatchObject({ outcome: "completed", written: 1 });
    expect(summary.notes.join(" ")).toContain("Aday eleği yapılamadı");
    expect(h.start).not.toHaveBeenCalled();
  });

  it("ingest kancası: kendi profilin ilgili hesapları aday yazılır; rakip profilinin ilgili hesapları yazılmaz; hata yutulur", async () => {
    const store = memoryStore();
    const written = await writeRelatedCandidates({
      client,
      workspaceId: WS,
      store,
      entries: [
        { owner: { kind: "own", id: "own-1" }, profile: { platform: "instagram", handle: "kendi.hesap", relatedHandles: ["ilgili.bir", "kendi.hesap", "ilgili.iki"] } },
        { owner: { kind: "competitor", id: "c1" }, profile: { platform: "instagram", handle: "rakip", relatedHandles: ["rakibin.ilgilisi"] } },
      ],
    });
    expect(written).toBe(2);
    expect(store.insertedRows.map((row) => [row.handle, row.status, row.source, row.discovered_via])).toEqual([
      ["ilgili.bir", "candidate", "related", "kendi.hesap"],
      ["ilgili.iki", "candidate", "related", "kendi.hesap"],
    ]);
    const broken = { ...memoryStore(), ownAccounts: async () => Promise.reject(new Error("db yok")) };
    await expect(writeRelatedCandidates({ client, workspaceId: WS, store: broken, entries: [{ owner: { kind: "own", id: "o" }, profile: { platform: "instagram", handle: "kendi.hesap", relatedHandles: ["x.hesap"] } }] })).resolves.toBe(0);
  });
});

describe("ücretli kaynaklar (tavan içinde)", () => {
  it("arama + aday profilleri: adaylar takipçiyle yazılır, benzer boy sayılır, harcama tavanı aşmaz", async () => {
    const store = memoryStore({ coauthors: [["ortak.bir"]], hashtags: HASHTAGS });
    const h = apifyHarness({ dataset: (kind) => (kind === "discovery_search" ? searchRows() : [profileRow("ortak.bir", { followersCount: 2100 })]) });
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.13, now: NOW }, { ...h.deps, store });

    expect(h.started().map((run) => [run.kind, run.label, run.expected])).toEqual([
      ["discovery_search", "arama: yogadersi", 15],
      ["discovery_search", "arama: nefescalismasi", 15],
      ["discovery_related", "aday profilleri (1 hesap)", 1],
    ]);
    expect(summary.sources.search.queries).toEqual(["yogadersi", "nefescalismasi"]);
    expect(summary.sources.search.written).toBe(10); // ikinci sorgunun aynı sonuçları tekrar yazılmaz
    expect(summary.enriched).toBe(1);
    expect(summary.cost.reservedUsd).toBeCloseTo(0.0775, 6);
    expect(summary.cost.reservedUsd).toBeLessThanOrEqual(0.13);
    expect(summary.candidates.total).toBe(11);
    expect(summary.candidates.similarSize).toBeGreaterThan(0);
    expect(store.rivals.every((rival) => rival.status === "candidate")).toBe(true);
    expect(store.insertedRows.filter((row) => row.source === "search").every((row) => typeof row.followers === "number" && row.discovered_via === "life coach women")).toBe(true);
    expect(store.patches).toEqual([{ id: "cand-1", patch: { followers: 2100, following: expect.any(Number), postsCount: expect.any(Number), missingFields: [] } }]);
  });

  it("tavan küçükse sonuç sayısı küçülür; alt sınıra da yetmiyorsa koşu HİÇ başlamaz", async () => {
    const shrink = apifyHarness({ unitPrice: 0.005, dataset: () => [] });
    await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.04, now: NOW }, { ...shrink.deps, store: memoryStore({ hashtags: HASHTAGS }) });
    expect(shrink.started().map((run) => run.expected)).toEqual([8]); // 0,04 / 0,005 = 8 sonuç; ikinci sorguya tavan kalmadı
    expect((shrink.started()[0].input as { searchLimit: number }).searchLimit).toBe(8);

    const none = apifyHarness({ unitPrice: 0.005 });
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.004, now: NOW }, { ...none.deps, store: memoryStore({ hashtags: HASHTAGS, coauthors: [["ortak.bir"]] }) });
    expect(none.start).not.toHaveBeenCalled();
    expect(summary.cost.reservedUsd).toBe(0);
    expect(summary.sources.coauthors.written).toBe(1); // ücretsiz kaynak yine çalıştı
    expect(summary.notes.join(" ")).toMatch(/tavana sığmıyor/);
  });

  it("aylık tavan reddederse (BudgetExceededError) kalan ücretli koşular durur; keşif hata vermez, ücretsiz adaylar kalır", async () => {
    const store = memoryStore({ coauthors: [["ortak.bir"]], hashtags: HASHTAGS });
    const h = apifyHarness({ startFails: () => new BudgetExceededError(0.04, 5, 5) });
    const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.13, now: NOW }, { ...h.deps, store });
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(summary.outcome).toBe("completed");
    expect(summary.cost.reservedUsd).toBe(0);
    expect(summary.candidates.total).toBe(1);
    expect(summary.notes.join(" ")).toMatch(/erken durdu: bütçe tavanı/);
  });

  it("modül aramayı desteklemiyorsa arama boş geçer (hata yok); aday profilleri yine alınır", async () => {
    const original = instagramPublicData.buildSearchJob;
    instagramPublicData.buildSearchJob = undefined;
    try {
      const store = memoryStore({ coauthors: [["ortak.bir"]], hashtags: HASHTAGS });
      const h = apifyHarness({ dataset: () => [profileRow("ortak.bir", { private: true })] });
      const summary = await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.13, now: NOW }, { ...h.deps, store });
      expect(h.started().map((run) => run.kind)).toEqual(["discovery_related"]);
      expect(summary.sources.search).toEqual({ found: 0, written: 0, queries: [] });
      // Gizli çıkan aday listeden düşer (izlenemez).
      expect(store.rivals.map((rival) => rival.status)).toEqual(["private"]);
      expect(summary.candidates).toEqual({ total: 0 });
    } finally {
      instagramPublicData.buildSearchJob = original;
    }
  });
});

describe("gizlilik: aday satırına kişi verisi yazılmaz", () => {
  const INJECTED = ["yorumcu.kisi_42", "gizli yorum metni 9f3a", "etiketlenen.hesap", "Aday Tam Ad", "https://cdn.ornek.test/foto.jpg", "ilgili.ucuncu.kisi", "778899001122", "aday biyografi metni"];
  const ALLOWED = new Set(["workspace_id", "platform", "handle", "status", "source", "discovered_via", "followers", "missing_fields"]);

  it("arama satırındaki yorumcu / etiket / ad / fotoğraf / ilgili kişi alanları atılır", async () => {
    const dirty = searchRows().map((row) => ({
      ...row,
      fullName: "Aday Tam Ad",
      biography: "aday biyografi metni",
      profilePicUrl: "https://cdn.ornek.test/foto.jpg",
      fbid: "778899001122",
      latestComments: [{ text: "gizli yorum metni 9f3a", ownerUsername: "yorumcu.kisi_42", owner: { id: "778899001122", username: "yorumcu.kisi_42" } }],
      taggedUsers: [{ username: "etiketlenen.hesap", full_name: "Aday Tam Ad" }],
      relatedProfiles: [{ username: "ilgili.ucuncu.kisi", full_name: "Aday Tam Ad" }],
      latestPosts: [{ ownerUsername: "yorumcu.kisi_42", taggedUsers: [{ username: "etiketlenen.hesap" }] }],
    }));
    const store = memoryStore({ hashtags: HASHTAGS });
    const h = apifyHarness({ dataset: (kind) => (kind === "discovery_search" ? dirty : []) });
    await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.13, now: NOW }, { ...h.deps, store });

    expect(store.insertedRows.length).toBeGreaterThan(0);
    for (const row of store.insertedRows) expect(Object.keys(row).every((name) => ALLOWED.has(name)), Object.keys(row).join(",")).toBe(true);
    const written = JSON.stringify([store.insertedRows, store.patches]);
    for (const value of INJECTED) expect(written, value).not.toContain(value);
  });

  it("aday profili bakışı yalnız sayıları yazar (ad, biyografi, fotoğraf yok)", async () => {
    const store = memoryStore({ coauthors: [["ortak.bir"]] });
    const h = apifyHarness({ dataset: () => [profileRow("ortak.bir", { fullName: "Aday Tam Ad", biography: "aday biyografi metni", profilePicUrl: "https://cdn.ornek.test/foto.jpg", followersCount: 900 })] });
    await discoverCandidates({ client, workspaceId: WS, maxUsd: 0.05, now: NOW }, { ...h.deps, store });
    expect(store.patches).toHaveLength(1);
    expect(Object.keys(store.patches[0].patch).sort()).toEqual(["followers", "following", "missingFields", "postsCount"]);
    for (const value of INJECTED) expect(JSON.stringify(store.patches), value).not.toContain(value);
  });
});

describe("verifyOwnAccount (hesap doğrulama)", () => {
  const verify = (h: ReturnType<typeof apifyHarness>, maxUsd = 0.2) => verifyOwnAccount({ client, workspaceId: WS, maxUsd, now: NOW }, { ...h.deps, store: memoryStore() });

  it("açık hesap: profil döner, tek profil koşusu açılır, tutar tavandan düşer", async () => {
    const h = apifyHarness({ dataset: () => [profileRow("kendi.hesap", { followersCount: 1447, biography: "kısa biyografi" })] });
    const result = await verify(h);
    expect(result).toMatchObject({ outcome: "ok", reservedUsd: 0.0025, profile: { handle: "kendi.hesap", followers: 1447, bio: "kısa biyografi" } });
    expect(h.started()).toMatchObject([{ kind: "profile", label: "doğrulama @kendi.hesap", expected: 1 }]);
  });

  it("gizli ve bulunamayan hesap ayrışır", async () => {
    expect(await verify(apifyHarness({ dataset: () => [profileRow("kendi.hesap", { private: true })] }))).toMatchObject({ outcome: "private", reason: "hesap gizli" });
    expect((await verify(apifyHarness({ dataset: () => loadFixture("access-not-found") }))).outcome).toBe("not_found");
  });

  it("tahmin tavanı aşıyorsa koşu başlamaz (blocked); koşu hatası error döner", async () => {
    const pricey = apifyHarness({ unitPrice: 0.5 });
    expect(await verify(pricey, 0.2)).toMatchObject({ outcome: "blocked", reservedUsd: 0 });
    expect(pricey.start).not.toHaveBeenCalled();
    expect((await verify(apifyHarness({ startFails: () => new Error("ağ hatası") }))).outcome).toBe("error");
  });

  it("kendi hesap yoksa koşu yok", async () => {
    const h = apifyHarness();
    expect((await verifyOwnAccount({ client, workspaceId: WS, maxUsd: 0.2, now: NOW }, { ...h.deps, store: memoryStore({ own: [] }) })).outcome).toBe("no_account");
    expect(h.start).not.toHaveBeenCalled();
  });
});
