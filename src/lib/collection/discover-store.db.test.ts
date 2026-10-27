/**
 * Entegrasyon: keşif deposu gerçek şemayla (lokal Supabase). Test KENDİ çalışma alanını kurar ve siler (seed'e / gerçek çalışma alanına
 * dokunmaz); Apify çağrısı YOK. Kanıtlar: aday `candidate` yazılır ve var olan satır (izlenen, yoksayılan) EZİLMEZ · aynı aday ikinci kez
 * yazılmaz · profil sayıları yalnız hâlâ aday olan satıra yazılır · gizli çıkan aday `private` olur. Supabase yoksa atlanır.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDiscoverStore } from "@/lib/collection/discover-store";
import { writeRelatedCandidates } from "@/lib/collection/discover-write";
import { connectLocalSupabase } from "@/lib/scoring/db-test-client";
import type { AdminClient } from "@/lib/supabase/admin";

const NOW = "2026-10-13T09:00:00.000Z";
const target = await connectLocalSupabase();
const title = `keşif deposu (lokal Supabase)${target.skip ? ` — atlandı: ${target.skip}` : ""}`;
if (target.skip) console.warn(`[collection] keşif DB testi atlandı: ${target.skip}`);

describe.skipIf(target.skip !== undefined)(title, () => {
  const client = target.client as AdminClient;
  const store = createDiscoverStore(client);
  let wsId = "";

  const rows = async () => {
    const { data, error } = await client.from("competitors").select("handle, status, source, discovered_via, followers, posts_count, missing_fields, status_reason, display_name, bio, avatar_url").eq("workspace_id", wsId).order("handle");
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  beforeAll(async () => {
    const ws = await client.from("workspaces").insert({ name: "Keşif testi", slug: `test-kesif-${randomUUID().slice(0, 8)}` }).select("id").single();
    if (ws.error || !ws.data) throw new Error(`test kurulumu: workspace (${ws.error?.message ?? "veri yok"})`);
    wsId = ws.data.id;
    const base = { workspace_id: wsId, platform: "instagram" as const };
    const own = await client.from("social_accounts").insert({ ...base, handle: "test_kendi", followers: 1000 }).select("id").single();
    if (own.error || !own.data) throw new Error(`test kurulumu: kendi hesap (${own.error?.message ?? "veri yok"})`);
    const rivals = await client.from("competitors").insert([{ ...base, handle: "izlenen", status: "tracked" }, { ...base, handle: "yoksayilan", status: "ignored" }]);
    if (rivals.error) throw new Error(`test kurulumu: rakipler (${rivals.error.message})`);
    const content = await client.from("content_items").insert([
      { ...base, social_account_id: own.data.id, external_id: "k1", format: "short_video", coauthors: ["ortak.bir"], hashtags: ["yogadersi"] },
      { ...base, social_account_id: own.data.id, external_id: "k2", format: "short_video", coauthors: [], hashtags: ["yogadersi", "reels"] },
    ]);
    if (content.error) throw new Error(`test kurulumu: içerik (${content.error.message})`);
  });

  afterAll(async () => {
    if (wsId === "") return;
    const { error } = await client.from("workspaces").delete().eq("id", wsId);
    if (error) throw new Error(`test çalışma alanı silinemedi (${error.message})`);
  });

  it("okumalar: kendi hesap, kayıtlı rakipler, kendi içeriklerin ortak yazar / etiket listeleri", async () => {
    expect(await store.ownAccounts(wsId)).toMatchObject([{ platform: "instagram", handle: "test_kendi", followers: 1000 }]);
    expect((await store.knownRivals(wsId)).map((rival) => [rival.handle, rival.status]).sort()).toEqual([["izlenen", "tracked"], ["yoksayilan", "ignored"]]);
    const signals = await store.ownContentSignals(wsId);
    expect(signals.coauthors.flat()).toEqual(["ortak.bir"]);
    expect(signals.hashtags.flat().sort()).toEqual(["reels", "yogadersi", "yogadersi"]);
  });

  it("aday yazımı: `candidate`, var olan satır ezilmez, ikinci yazım tekrar etmez; ad / biyografi / fotoğraf boş kalır", async () => {
    const candidates = [
      { platform: "instagram" as const, handle: "aday.bir", source: "search" as const, via: "yogadersi", followers: 2400 },
      { platform: "instagram" as const, handle: "aday.iki", source: "related" as const, via: "test_kendi" },
      { platform: "instagram" as const, handle: "izlenen", source: "search" as const },
    ];
    expect(await store.insertCandidates(wsId, candidates)).toBe(2);
    expect(await store.insertCandidates(wsId, candidates)).toBe(0);
    const all = await rows();
    expect(all.map((row) => [row.handle, row.status, row.source, row.discovered_via, row.followers])).toEqual([
      ["aday.bir", "candidate", "search", "yogadersi", 2400],
      ["aday.iki", "candidate", "related", "test_kendi", null],
      ["izlenen", "tracked", "manual", null, null],
      ["yoksayilan", "ignored", "manual", null, null],
    ]);
    expect(all.find((row) => row.handle === "aday.iki")?.missing_fields).toEqual(["followers", "following", "postsCount"]);
    for (const row of all) expect([row.display_name, row.bio, row.avatar_url]).toEqual([null, null, null]);
  });

  it("profil sayıları yalnız aday satıra yazılır; gizli çıkan aday `private` olur; izlenen rakibe dokunulmaz", async () => {
    const known = await store.knownRivals(wsId);
    const id = (handle: string) => known.find((rival) => rival.handle === handle)?.id ?? "";
    expect(await store.updateCandidate(wsId, id("aday.iki"), { followers: 800, postsCount: 40, missingFields: ["following"] }, NOW)).toBe(true);
    expect(await store.updateCandidate(wsId, id("aday.bir"), { access: { state: "private", reason: "hesap gizli" } }, NOW)).toBe(true);
    expect(await store.updateCandidate(wsId, id("izlenen"), { followers: 5 }, NOW)).toBe(false);
    const all = await rows();
    expect(all.map((row) => [row.handle, row.status, row.followers, row.status_reason])).toEqual([
      ["aday.bir", "private", 2400, "hesap gizli"],
      ["aday.iki", "candidate", 800, null],
      ["izlenen", "tracked", null, null],
      ["yoksayilan", "ignored", null, null],
    ]);
  });

  it("ingest kancası gerçek depoyla: kendi profilin ilgili hesapları aday olur", async () => {
    const written = await writeRelatedCandidates({ client, workspaceId: wsId, entries: [{ owner: { kind: "own", id: "x" }, profile: { platform: "instagram", handle: "test_kendi", relatedHandles: ["ilgili.bir", "izlenen", "test_kendi"] } }] });
    expect(written).toBe(1);
    expect((await rows()).find((row) => row.handle === "ilgili.bir")).toMatchObject({ status: "candidate", source: "related", discovered_via: "test_kendi" });
  });
});
