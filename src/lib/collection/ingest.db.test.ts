/**
 * Entegrasyon: lokal Supabase'te KENDİ test çalışma alanını kurar (seed çalışma alanına dokunmaz), gerçek Apify
 * fixture'larıyla profil + içerik ingest'i ve skor yeniden hesaplamasını uçtan uca doğrular, sonra çalışma alanını
 * siler (cascade). Supabase yoksa atlanır (neden başlıkta).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestContent } from "@/lib/collection/ingest-content";
import { ingestProfiles, markCompetitorAccess } from "@/lib/collection/ingest-profile";
import { executeScrape, finishIngested } from "@/lib/collection/run-scrape";
import type { CollectContext, PlannedJob, ResolvedDeps } from "@/lib/collection/types";
import { parseContent } from "@/lib/platforms/instagram/normalize-content";
import { parseProfiles } from "@/lib/platforms/instagram/normalize-profile";
import { loadFixture } from "@/lib/platforms/instagram/test-support";
import { createSupabaseScoringStore, recomputeWorkspaceScores } from "@/lib/scoring";
import { connectLocalSupabase } from "@/lib/scoring/db-test-client";
import type { AdminClient } from "@/lib/supabase/admin";

const NOW = new Date("2026-09-30T12:00:00Z");

type Result = { data: unknown; error: { message: string } | null };

function must<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  const { data, error } = result;
  if (error || data === null || data === undefined) throw new Error(`test kurulumu: ${what} (${error?.message ?? "veri yok"})`);
  return data as NonNullable<R["data"]>;
}

const target = await connectLocalSupabase();
const title = `toplama ingest (lokal Supabase)${target.skip ? ` — atlandı: ${target.skip}` : ""}`;
if (target.skip) console.warn(`[collection] DB entegrasyon testi atlandı: ${target.skip}`);

describe.skipIf(target.skip !== undefined)(title, () => {
  const client = target.client as AdminClient;
  const items = parseContent(loadFixture("reel")).items;
  const profile = parseProfiles(loadFixture("profile")).items[0];
  const store = createSupabaseScoringStore(client);
  let wsId: string;
  let ownId: string;
  let rivalId: string;
  const runs: Record<"profile" | "content1" | "content2", string> = { profile: "", content1: "", content2: "" };

  async function openRun(kind: "profile" | "content"): Promise<string> {
    const row = must(
      await client
        .from("collection_runs")
        .insert({ workspace_id: wsId, provider: "apify", kind, status: "running", reserved_usd: 0 })
        .select("id")
        .single(),
      "koşu",
    );
    return row.id;
  }

  beforeAll(async () => {
    const ws = must(
      await client.from("workspaces").insert({ name: "Toplama testi", slug: `test-toplama-${randomUUID().slice(0, 8)}` }).select("id").single(),
      "workspace",
    );
    wsId = ws.id;
    const base = { workspace_id: wsId, platform: "instagram" as const };
    ownId = must(await client.from("social_accounts").insert({ ...base, handle: "test_kendi" }).select("id").single(), "kendi hesap").id;
    rivalId = must(
      await client.from("competitors").insert({ ...base, handle: "test_rakip", status: "tracked" }).select("id").single(),
      "rakip",
    ).id;
    runs.profile = await openRun("profile");
    runs.content1 = await openRun("content");
    runs.content2 = await openRun("content");
  });

  afterAll(async () => {
    if (!wsId) return;
    const { error } = await client.from("workspaces").delete().eq("id", wsId);
    if (error) throw new Error(`test çalışma alanı silinemedi (${error.message})`);
    const left = await client.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
    expect(left.count).toBe(0);
  });

  it("profil: account_snapshots + sahip kimliği/adı/sayaçları güncellenir (kendi hesap ve rakip)", async () => {
    const own = { kind: "own" as const, id: ownId };
    const rival = { kind: "competitor" as const, id: rivalId };
    const result = await ingestProfiles(
      { workspaceId: wsId, collectionRunId: runs.profile, now: NOW, entries: [{ owner: own, profile }, { owner: rival, profile }] },
      { client },
    );
    expect(result).toEqual({ snapshots: 2, snapshotsAlreadyWritten: 0, ownersUpdated: 2 });

    const snapshots = must(
      await client.from("account_snapshots").select("social_account_id, competitor_id, followers, following, posts_count, source, captured_at").eq("workspace_id", wsId),
      "hesap ölçümleri",
    );
    expect(snapshots).toHaveLength(2);
    for (const row of snapshots) {
      expect(row).toMatchObject({ followers: profile.followers, following: profile.following, posts_count: profile.postsCount, source: "apify" });
      expect(new Date(row.captured_at).toISOString()).toBe(NOW.toISOString());
    }

    const ownRow = must(await client.from("social_accounts").select("external_id, display_name, followers, last_synced_at").eq("id", ownId).single(), "kendi hesap");
    expect(ownRow).toMatchObject({ external_id: profile.externalId, display_name: profile.displayName, followers: profile.followers });
    expect(ownRow.last_synced_at).not.toBeNull();
    const rivalRow = must(await client.from("competitors").select("external_id, display_name, followers, status, last_collected_at").eq("id", rivalId).single(), "rakip");
    expect(rivalRow).toMatchObject({ external_id: profile.externalId, followers: profile.followers, status: "tracked" });
    expect(rivalRow.last_collected_at).not.toBeNull();

    // Aynı koşunun yeniden ingest'i ikinci ölçüm yazmaz (idempotent).
    const again = await ingestProfiles(
      { workspaceId: wsId, collectionRunId: runs.profile, now: NOW, entries: [{ owner: own, profile }, { owner: rival, profile }] },
      { client },
    );
    expect(again).toMatchObject({ snapshots: 0, snapshotsAlreadyWritten: 2 });
  });

  it("içerik: content_items + metric_snapshots yazılır; medya adresi/yorumcu alanı DB'ye girmez", async () => {
    const rival = { kind: "competitor" as const, id: rivalId };
    const result = await ingestContent(
      { workspaceId: wsId, owner: rival, items, collectionRunId: runs.content1, ownerFollowers: profile.followers, now: NOW },
      { client },
    );
    expect(result).toEqual({ contentItems: 10, snapshots: 10, snapshotsAlreadyWritten: 0, skippedOtherOwner: 0 });

    const content = must(await client.from("content_items").select("*").eq("workspace_id", wsId), "içerikler");
    expect(content).toHaveLength(10);
    for (const row of content) {
      expect(row).toMatchObject({ platform: "instagram", format: "short_video", competitor_id: rivalId, social_account_id: null, is_pinned: null });
      expect(row.external_id).toBeTruthy();
      expect(row.url).toMatch(/^https:\/\/www\.instagram\.com\//);
    }

    const snapshots = must(await client.from("metric_snapshots").select("*").eq("workspace_id", wsId), "ölçümler");
    expect(snapshots).toHaveLength(10);
    for (const row of snapshots) {
      expect(row).toMatchObject({ views_kind: "ig_play_count", source: "apify", collection_run_id: runs.content1, owner_followers: profile.followers });
      expect(row.views).toBeGreaterThan(0);
      // Bu aktörde ölçülemeyenler NULL (0 değil).
      expect(row.shares).toBeNull();
      expect(row.saves).toBeNull();
      expect(row.reach).toBeNull();
      expect(row.avg_watch_sec).toBeNull();
    }

    // Hiçbir sütunda video/CDN adresi ya da yorumcu izi yok.
    const dump = JSON.stringify([content, snapshots]);
    for (const raw of loadFixture("reel")) {
      if (typeof raw.videoUrl === "string") expect(dump).not.toContain(raw.videoUrl.slice(0, 40));
    }
    expect(dump).not.toMatch(/videoUrl|ephemeral|latestComments|firstComment/i);
  });

  it("aynı koşunun yeniden ingest'i çift kayıt yazmaz; yeni koşu yeni ölçüm ekler, içerik sayısı sabit", async () => {
    const rival = { kind: "competitor" as const, id: rivalId };
    const same = await ingestContent({ workspaceId: wsId, owner: rival, items, collectionRunId: runs.content1, now: NOW }, { client });
    expect(same).toMatchObject({ contentItems: 10, snapshots: 0, snapshotsAlreadyWritten: 10 });

    const later = new Date(NOW.getTime() + 3_600_000);
    const next = await ingestContent({ workspaceId: wsId, owner: rival, items, collectionRunId: runs.content2, now: later }, { client });
    expect(next).toMatchObject({ contentItems: 10, snapshots: 10 });

    const count = async (table: "content_items" | "metric_snapshots") =>
      (await client.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count;
    expect(await count("content_items")).toBe(10);
    expect(await count("metric_snapshots")).toBe(20);
    // İkinci koşuda takipçi verilmedi → owner_followers NULL.
    const second = must(await client.from("metric_snapshots").select("owner_followers").eq("collection_run_id", runs.content2), "ikinci koşu");
    expect(second.every((row) => row.owner_followers === null)).toBe(true);
  });

  it("başka sahibe kayıtlı içerik (ortak yazarlı gönderi) sahip değiştirmez, atlanır", async () => {
    const own = { kind: "own" as const, id: ownId };
    const result = await ingestContent({ workspaceId: wsId, owner: own, items, collectionRunId: runs.content1, now: NOW }, { client });
    expect(result).toEqual({ contentItems: 0, snapshots: 0, snapshotsAlreadyWritten: 0, skippedOtherOwner: 10 });
    const owned = await client.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("competitor_id", rivalId);
    expect(owned.count).toBe(10);
  });

  it("skor: ingest edilen içerik için lift/baz çizgisi yazılır; ikinci çalıştırma aynı sonucu verir", async () => {
    const first = await recomputeWorkspaceScores(wsId, NOW, { store });
    expect(first.failures).toEqual([]);
    expect(first.items).toBe(10); // kendi hesabın içeriği yok, rakibin 10 içeriği var

    const read = async () =>
      must(
        await client.from("content_items").select("external_id, views_kind, baseline_n, lift, lift_tier, low_confidence, cross_score, scored_at").eq("workspace_id", wsId).order("external_id"),
        "skorlar",
      );
    const rows = await read();
    expect(rows.every((row) => row.scored_at !== null && row.views_kind === "ig_play_count")).toBe(true);
    // 10 içerik: her biri kendisi hariç 9'luk baz çizgisi (n < 10 → düşük güven) ama lift hesaplanır.
    expect(rows.every((row) => row.lift !== null && row.baseline_n === 9 && row.low_confidence)).toBe(true);
    // Takipçi bilinen (1447) → crossScore hesaplanır.
    expect(rows.every((row) => row.cross_score !== null)).toBe(true);

    await recomputeWorkspaceScores(wsId, NOW, { store });
    expect(await read()).toEqual(rows);
  });

  it("koşu yaşam döngüsü: finished_at gerçek saatle yazılır (tur saati koşu başlangıcından eski olsa bile)", async () => {
    const runId = await openRun("content"); // DB `started_at` = şimdi
    const deps = {
      client,
      clock: () => new Date(),
      start: async () => ({ run: { id: runId }, externalRunId: "ext-x", datasetId: "ds-x", estimate: { amountUsd: 0, priceUnknown: false } }),
      wait: async () => ({ run: { runId: "ext-x", status: "SUCCEEDED" }, timedOut: false }),
      datasetItems: async () => [],
    } as unknown as ResolvedDeps;
    const ctx: CollectContext = {
      workspaceId: wsId,
      now: new Date(Date.now() - 3_600_000), // tur saati koşudan 1 saat ESKİ (CLI'da tur başında alınır)
      deps,
      log: () => undefined,
      runIds: [],
      pending: new Map(),
      notes: [],
      followers: new Map(),
    };
    const job = { label: "@test_rakip", spec: { kind: "content", actorId: "a/b", input: {}, expectedResults: 1 }, targets: [], estimatedUsd: 0, priceUnknown: false } as PlannedJob;

    const result = await executeScrape(ctx, job);
    expect(result).toMatchObject({ ok: true, runId });
    await finishIngested(ctx, runId, { itemCount: 0, notItems: [{ reason: "boş zarf" }] });

    const row = must(await client.from("collection_runs").select("status, finished_at, started_at, item_count, not_item_reasons").eq("id", runId).single(), "koşu");
    expect(row.status).toBe("ingested");
    expect(row.finished_at).not.toBeNull();
    expect(new Date(row.finished_at as string).getTime()).toBeGreaterThanOrEqual(new Date(row.started_at).getTime());
    expect(row).toMatchObject({ item_count: 0, not_item_reasons: [{ reason: "boş zarf" }] });
    expect(ctx.notes).toEqual([]);
    expect(ctx.pending.has(runId)).toBe(true); // mutabakat tur sonunda (kullanım oturunca)
  });

  it("erişim hatası: yalnız tracked rakip private/not_found olur; ikinci çağrı değişiklik yapmaz", async () => {
    expect(await markCompetitorAccess({ workspaceId: wsId, competitorId: rivalId, state: "private", reason: "Restricted profile (@x)\n  erişim yok" }, { client })).toBe(true);
    const after = must(await client.from("competitors").select("status, status_reason").eq("id", rivalId).single(), "durum");
    expect(after.status).toBe("private");
    expect(after.status_reason, "sebep tek satıra indirilir ve kaydedilir").toBe("Restricted profile (@x) erişim yok");
    expect(await markCompetitorAccess({ workspaceId: wsId, competitorId: rivalId, state: "not_found" }, { client })).toBe(false);
    expect(must(await client.from("competitors").select("status").eq("id", rivalId).single(), "durum").status).toBe("private");
  });
});
