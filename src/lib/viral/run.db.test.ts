/**
 * Uçtan uca (lokal Supabase + SAHTE Apify): konu → iş → ayrıştırma → eşik → `viral_items`. Test KENDİ çalışma alanını kurar ve siler;
 * Apify koşusu açılmaz (sahte istemci; `collection_runs`'a yazılmaz). Kanıtlar: konu × platform başına ≥ 20 patlamış video kaydolur · eşik
 * altı / eski / takipçisiz videolar kaydolmaz · enjekte edilen yorumcu / etiketlenen / anılan / ad / medya verisi tabloya girmez · ikinci koşu
 * aynı satırları tekrar yazmaz (tazeler) · `--apify-max` yoksa hiç koşu başlamaz. Supabase yoksa atlanır.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePaidRun } from "@/lib/collection/discover-paid";
import { apifyHarness, NOW } from "@/lib/collection/discover-test-support";
import { connectLocalSupabase } from "@/lib/scoring/db-test-client";
import type { AdminClient } from "@/lib/supabase/admin";
import { runViralHunt } from "@/lib/viral/run";
import { weekSpentUsd } from "@/lib/viral/week-spend";

const target = await connectLocalSupabase();
const title = `viral av uçtan uca (lokal Supabase)${target.skip ? ` — atlandı: ${target.skip}` : ""}`;
if (target.skip) console.warn(`[viral] DB testi atlandı: ${target.skip}`);

const TOPICS = ["kahve demleme", "ev baristası", "espresso"];
const PER_TOPIC_VIRAL = 30;
const PER_TOPIC_NOISE = 6;
const DIRTY = "KIRLI_VERI";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const slug = (query: string) => query.replace(/ı/g, "i").replace(/\s+/g, "_");

/** Konu başına: 30 patlamış + eski + düşük izlenmeli + büyük hesaplı satırlar (ham aktör biçimi, kirli alanlarla). */
function instagramRows(query: string): unknown[] {
  const s = slug(query);
  const rows: unknown[] = [];
  for (let i = 0; i < PER_TOPIC_VIRAL; i += 1) {
    rows.push({
      id: `ig-${s}-${i}`, type: "Video", productType: "clips", shortCode: `V${s}${i}`, url: `https://www.instagram.com/reel/V${s}${i}/`,
      caption: `${query} ipucu ${i} #${slug(query)}`, hashtags: [slug(query)], commentsCount: 10, likesCount: 500, videoPlayCount: 40_000 + i,
      timestamp: daysAgo(3).toISOString(), videoDuration: 20, ownerUsername: `ig_${s}_${i}`,
      latestComments: [{ ownerUsername: DIRTY, text: DIRTY }], firstComment: DIRTY, taggedUsers: [{ username: DIRTY }], mentions: [DIRTY],
      ownerFullName: DIRTY, ownerId: DIRTY, displayUrl: `https://scontent.cdninstagram.com/${DIRTY}.jpg`, videoUrl: `https://scontent.cdninstagram.com/${DIRTY}.mp4`,
    });
  }
  rows.push({ id: `ig-${s}-old`, shortCode: `O${s}`, url: `https://www.instagram.com/reel/O${s}/`, hashtags: [], videoPlayCount: 900_000, timestamp: daysAgo(60).toISOString(), ownerUsername: `ig_${s}_0` });
  for (let i = 0; i < PER_TOPIC_NOISE; i += 1) {
    rows.push({ id: `ig-${s}-low-${i}`, shortCode: `L${s}${i}`, url: `https://www.instagram.com/reel/L${s}${i}/`, hashtags: [], videoPlayCount: 2_000, timestamp: daysAgo(2).toISOString(), ownerUsername: `ig_${s}_low_${i}` });
  }
  rows.push({ id: `ig-${s}-big`, shortCode: `B${s}`, url: `https://www.instagram.com/reel/B${s}/`, hashtags: [], videoPlayCount: 50_000, timestamp: daysAgo(2).toISOString(), ownerUsername: `ig_${s}_big` });
  return rows;
}

function tiktokRows(query: string): unknown[] {
  const s = slug(query);
  const rows: unknown[] = [];
  for (let i = 0; i < PER_TOPIC_VIRAL; i += 1) {
    const id = `73${String(Math.abs(hash(s))).padStart(8, "0").slice(0, 8)}${String(i).padStart(9, "0")}`;
    rows.push({
      id, text: `${query} ${i} #${s}`, createTimeISO: daysAgo(4).toISOString(), webVideoUrl: `https://www.tiktok.com/@tt_${s}_${i}/video/${id}`,
      isAd: false, isSlideshow: false, videoMeta: { duration: 25, coverUrl: `https://p16.tiktokcdn.com/${DIRTY}.jpg` }, hashtags: [{ name: s }],
      playCount: 60_000 + i, diggCount: 900, commentCount: 20, shareCount: 30,
      authorMeta: { name: `tt_${s}_${i}`, nickName: DIRTY, avatar: `https://p16.tiktokcdn.com/${DIRTY}.jpg`, signature: DIRTY, fans: 3_000 },
      mentions: [DIRTY], commentsDatasetUrl: DIRTY,
    });
  }
  const bigId = `74${String(Math.abs(hash(s))).padStart(8, "0").slice(0, 8)}000000001`;
  rows.push({ id: bigId, text: "büyük hesap", createTimeISO: daysAgo(4).toISOString(), webVideoUrl: `https://www.tiktok.com/@tt_big_${s}/video/${bigId}`, isAd: false, isSlideshow: false, hashtags: [], playCount: 80_000, authorMeta: { name: `tt_big_${s}`, fans: 5_000_000 } });
  return rows;
}

function hash(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) % 99_999_989;
  return h;
}

describe.skipIf(target.skip !== undefined)(title, () => {
  const client = target.client as AdminClient;
  let wsId = "";

  const harness = () =>
    apifyHarness({
      unitPrice: 0.003,
      dataset: (_kind, request) => {
        const input = request.input as { hashtags?: string[]; usernames?: string[] };
        if (input.usernames) return input.usernames.map((username) => ({ username, followersCount: username.endsWith("_big") ? 5_000_000 : 1_000, fullName: DIRTY, biography: DIRTY }));
        const query = input.hashtags?.[0] ?? "";
        const isTikTok = request.actorId.includes("tiktok");
        return isTikTok ? tiktokRows(query) : instagramRows(query);
      },
    });

  beforeAll(async () => {
    const ws = await client.from("workspaces").insert({ name: "Viral testi", slug: `test-viral-${randomUUID().slice(0, 8)}` }).select("id").single();
    if (ws.error || !ws.data) throw new Error(`test kurulumu: workspace (${ws.error?.message ?? "veri yok"})`);
    wsId = ws.data.id;
  });

  afterAll(async () => {
    if (wsId === "") return;
    const { error } = await client.from("workspaces").delete().eq("id", wsId);
    if (error) throw new Error(`test çalışma alanı silinemedi (${error.message})`);
  });

  const options = (extra: Record<string, unknown> = {}) => ({ workspaceId: wsId, now: NOW, manualTopics: TOPICS, perQueryLimit: 50, ...extra });

  it("--apify-max yoksa hiç koşu başlamaz ve tabloya yazılmaz", async () => {
    const h = harness();
    const summary = await runViralHunt(options(), { collect: h.deps, client, estimate: h.deps.estimate });
    expect(summary.outcome).toBe("dry_run");
    expect(h.start).not.toHaveBeenCalled();
    const { count } = await client.from("viral_items").select("*", { count: "exact", head: true }).eq("workspace_id", wsId);
    expect(count).toBe(0);
  });

  it("gerçek akış: konu × platform başına ≥ 20 patlamış video kaydolur; elenenler ve kirli veri girmez", async () => {
    const h = harness();
    const summary = await runViralHunt(options({ maxUsd: 1.5 }), { collect: h.deps, client });
    expect(summary.outcome).toBe("done");
    const { data, error } = await client.from("viral_items").select("*").eq("workspace_id", wsId);
    expect(error).toBeNull();
    const rows = data ?? [];

    for (const query of TOPICS) {
      for (const platform of ["instagram", "tiktok"]) {
        const n = rows.filter((r) => r.query === query && r.platform === platform).length;
        expect(n, `${platform} · ${query}`).toBeGreaterThanOrEqual(20);
        expect(n).toBe(PER_TOPIC_VIRAL);
      }
    }
    expect(rows).toHaveLength(TOPICS.length * 2 * PER_TOPIC_VIRAL);
    for (const row of rows) {
      expect(row.views_per_follower).toBeGreaterThanOrEqual(3);
      expect(row.views).toBeGreaterThanOrEqual(10_000);
      expect(row.author_followers).toBeGreaterThan(0);
      expect(row.caption === null || row.caption.length <= 500).toBe(true);
    }
    // Gizlilik: enjekte edilen kişi / medya verisi hiçbir sütunda yok.
    expect(JSON.stringify(rows)).not.toContain(DIRTY);
    // Eski / düşük izlenmeli / büyük hesaplı kayıt yok.
    expect(rows.some((r) => /-old|-low-|-big|tt_big_/.test(`${r.external_id}${r.author_handle}`))).toBe(false);
  });

  it("ikinci koşu aynı satırları tekrar yazmaz: sayılar tazelenir, ilk bulan sorgu ve found_at korunur", async () => {
    const before = (await client.from("viral_items").select("platform, external_id, found_at, query").eq("workspace_id", wsId)).data ?? [];
    const h = harness();
    const later = new Date(NOW.getTime() + 3_600_000);
    const summary = await runViralHunt(options({ maxUsd: 1.5, now: later }), { collect: h.deps, client });
    expect(summary.written).toMatchObject({ inserted: 0, refreshed: before.length });
    const after = (await client.from("viral_items").select("platform, external_id, found_at, query, refreshed_at").eq("workspace_id", wsId)).data ?? [];
    expect(after).toHaveLength(before.length);
    const foundAt = new Map(before.map((r) => [`${r.platform}:${r.external_id}`, r.found_at]));
    for (const row of after) {
      expect(row.found_at).toBe(foundAt.get(`${row.platform}:${row.external_id}`));
      expect(new Date(row.refreshed_at).getTime()).toBe(later.getTime());
    }
  });

  it("k5: haftalık tavan bu haftaki harcamayı düşer; tavan dolduysa koşu açılmaz", async () => {
    const full = harness();
    const blocked = await runViralHunt(options({ maxUsd: 1.5 }), { collect: full.deps, client, weekSpent: async () => 1.5 });
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.reason).toMatch(/doldu/);
    expect(full.start).not.toHaveBeenCalled();

    const part = harness();
    const trimmed = await runViralHunt(options({ maxUsd: 1.5 }), { collect: part.deps, client, weekSpent: async () => 1.2 });
    expect(trimmed.notes.some((note) => /0\.3 USD kaldı/.test(note))).toBe(true);
  });

  it("k6: kayıt patlasa da açılan koşular mutabakata bağlanır (tur kapatılır)", async () => {
    const h = harness();
    const close = vi.fn(closePaidRun);
    const save = vi.fn(async () => {
      throw new Error("yazım patladı");
    });
    await expect(runViralHunt(options({ maxUsd: 1.5 }), { collect: h.deps, client, save, close })).rejects.toThrow("yazım patladı");
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("haftalık harcama yalnız viral av koşularını sayar; hafta başı İstanbul Pazartesi 00:00 (k5)", async () => {
    const own = randomUUID().slice(0, 8);
    const ws = await client.from("workspaces").insert({ name: "Viral hafta testi", slug: `test-viral-hafta-${own}` }).select("id").single();
    if (ws.error || !ws.data) throw new Error(`test kurulumu: workspace (${ws.error?.message ?? "veri yok"})`);
    try {
      const run = (label: string, startedAt: string, usd: number) => ({ workspace_id: ws.data.id, provider: "apify", kind: "content", target_label: label, reserved_usd: usd, actual_usd: usd, started_at: startedAt, status: "ingested" });
      const inserted = await client.from("collection_runs").insert([
        run("viral:instagram:kahve", "2026-10-18T22:00:00Z", 0.2), // Pazartesi 01:00 İstanbul: bu hafta
        run("viral:tiktok:profil (3 hesap)", "2026-10-20T10:00:00Z", 0.1),
        run("viral:instagram:eski", "2026-10-18T20:30:00Z", 5), // Pazar 23:30 İstanbul: önceki hafta
        run("profil (@ornek)", "2026-10-20T10:00:00Z", 7), // normal toplama: av bütçesine sayılmaz
        run("keşif", "2026-10-19T10:00:00Z", 9),
      ]);
      expect(inserted.error).toBeNull();
      expect(await weekSpentUsd(client, ws.data.id, new Date("2026-10-21T09:00:00Z"))).toBeCloseTo(0.3);
    } finally {
      await client.from("workspaces").delete().eq("id", ws.data.id);
    }
  });

  it("Y7: kapatma da patlarsa asıl hata gizlenmez; gövde sağlamsa kapatma hatası fırlar", async () => {
    const failingClose = vi.fn(async () => {
      throw new Error("kapatma patladı");
    });
    const save = vi.fn(async () => {
      throw new Error("yazım patladı");
    });
    const h = harness();
    await expect(runViralHunt(options({ maxUsd: 1.5 }), { collect: h.deps, client, save, close: failingClose })).rejects.toThrow("yazım patladı");
    expect(failingClose).toHaveBeenCalledTimes(1);
    const h2 = harness();
    await expect(runViralHunt(options({ maxUsd: 1.5 }), { collect: h2.deps, client, close: failingClose })).rejects.toThrow("kapatma patladı");
  });
});
