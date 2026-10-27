/**
 * Entegrasyon: lokal Supabase'te test çalışma alanı kurar (1 kendi hesap, 1 izlenen + 1 yoksayılan rakip,
 * ~24 içerik, metrik ve takipçi ölçümleri), skorları yeniden hesaplar, DB'deki skor sütunlarını beklenen değerlerle
 * karşılaştırır ve çalışma alanını siler (cascade). Seed çalışma alanına dokunmaz. Supabase yoksa atlanır (neden başlıkta).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectLocalSupabase } from "@/lib/scoring/db-test-client";
import { recomputeAccountScores } from "@/lib/scoring/recompute";
import { recomputeWorkspaceScores } from "@/lib/scoring/recompute-workspace";
import { createSupabaseScoringStore } from "@/lib/scoring/supabase-store";
import type { BaselineBasisJson, ScoringOwner } from "@/lib/scoring/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type ViewsKind = Database["public"]["Enums"]["views_kind"];
type Format = Database["public"]["Enums"]["content_format"];

const NOW = new Date("2026-09-30T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

interface ContentSpec {
  ext: string;
  owner: "own" | "rival" | "ignored";
  /** Yayından bu yana geçen süre (ms); null = yayın tarihi bilinmiyor. */
  age: number | null;
  /** En son ölçüm; undefined = hiç ölçülmedi (snapshot yok). */
  views?: number | null;
  kind?: ViewsKind | null;
  /** Daha eski bir ölçüm (en son ölçüm kullanılmalı). */
  olderViews?: number;
  format?: Format;
  pinned?: boolean;
}

// Rakip: 11 olgun kısa video (4..14 gün, 1000..2000) + tutan (3,5 gün, 9000) + her dışlama kuralından bir içerik.
const CONTENT: ContentSpec[] = [
  ...Array.from({ length: 11 }, (_, i): ContentSpec => ({
    ext: `n${i + 1}`,
    owner: "rival",
    age: (i + 4) * DAY,
    views: 1000 + i * 100,
    olderViews: i === 0 ? 5000 : undefined,
  })),
  { ext: "hit", owner: "rival", age: 3.5 * DAY, views: 9000, olderViews: 2000 },
  { ext: "pinned", owner: "rival", age: 20 * DAY, views: 50_000, pinned: true },
  { ext: "young", owner: "rival", age: 1 * DAY, views: 800 },
  { ext: "unmeasured", owner: "rival", age: 5.5 * DAY },
  { ext: "carousel", owner: "rival", age: 6.5 * DAY, views: null, kind: null, format: "carousel" },
  { ext: "otherkind", owner: "rival", age: 7.5 * DAY, views: 5000, kind: "ig_view_count" },
  { ext: "nodate", owner: "rival", age: null, views: 1200 },
  // Kendi hesap: 5 içerik (n < 10 → düşük güven), takipçi ölçümü yok.
  ...[1000, 1000, 2000, 2000, 3000].map((views, i): ContentSpec => ({
    ext: `o${i + 1}`,
    owner: "own",
    age: (8 - i) * DAY,
    views,
    kind: "ig_views",
  })),
  { ext: "x1", owner: "ignored", age: 5 * DAY, views: 1000 },
];
const RIVAL_COUNT = CONTENT.filter((c) => c.owner === "rival").length;
const OWN_COUNT = CONTENT.filter((c) => c.owner === "own").length;

const SCORE_SELECT =
  "external_id, views_kind, baseline_views, baseline_n, baseline_excluded, baseline_basis, lift, lift_tier, low_confidence, immature, cross_score, scored_at";

type Result = { data: unknown; error: { message: string } | null };

function must<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  const { data, error } = result;
  if (error || data === null || data === undefined) throw new Error(`test kurulumu: ${what} (${error?.message ?? "veri yok"})`);
  return data as NonNullable<R["data"]>;
}

interface Seeded {
  wsId: string;
  own: ScoringOwner;
  rival: ScoringOwner;
  /** external_id → content_items.id */
  ids: Map<string, string>;
}

async function seed(client: AdminClient, onWorkspace: (wsId: string) => void): Promise<Seeded> {
  const slug = `test-skor-${randomUUID().slice(0, 8)}`;
  const ws = must(await client.from("workspaces").insert({ name: "Skor testi", slug }).select("id").single(), "workspace");
  onWorkspace(ws.id);
  const base = { workspace_id: ws.id, platform: "instagram" as const };
  const own = must(
    await client.from("social_accounts").insert({ ...base, handle: "test_kendi" }).select("id").single(),
    "kendi hesap",
  );
  const rivals = must(
    await client
      .from("competitors")
      .insert([
        { ...base, handle: "test_rakip", status: "tracked" },
        { ...base, handle: "test_yoksay", status: "ignored" },
      ])
      .select("id, handle"),
    "rakipler",
  );
  const rivalId = rivals.find((r) => r.handle === "test_rakip")?.id as string;
  const ignoredId = rivals.find((r) => r.handle === "test_yoksay")?.id as string;
  const ownerIds = { own: { social_account_id: own.id }, rival: { competitor_id: rivalId }, ignored: { competitor_id: ignoredId } };

  const inserted = must(
    await client
      .from("content_items")
      .insert(
        CONTENT.map((c) => ({
          ...base,
          ...ownerIds[c.owner],
          external_id: c.ext,
          format: c.format ?? "short_video",
          published_at: c.age === null ? null : ago(c.age),
          is_pinned: c.pinned ?? null,
        })),
      )
      .select("id, external_id"),
    "içerikler",
  );
  const ids = new Map(inserted.map((row) => [row.external_id, row.id]));

  const snapshots = CONTENT.flatMap((c) => {
    if (c.views === undefined) return [];
    const snap = (views: number | null, capturedAt: string) => ({
      workspace_id: ws.id,
      content_item_id: ids.get(c.ext) as string,
      captured_at: capturedAt,
      views,
      views_kind: c.kind === undefined ? ("ig_play_count" as const) : c.kind,
      likes: 50,
      source: "apify",
    });
    const latest = snap(c.views, ago(HOUR));
    return c.olderViews === undefined ? [latest] : [snap(c.olderViews, ago(3 * DAY)), latest];
  });
  must(await client.from("metric_snapshots").insert(snapshots).select("id"), "metrik ölçümleri");

  // Takipçi: en yeni ölçüm NULL → en son BİLİNEN (10.000) kullanılır.
  must(
    await client
      .from("account_snapshots")
      .insert(
        [
          [10 * DAY, 5000],
          [2 * DAY, 10_000],
          [HOUR, null],
        ].map(([age, followers]) => ({
          ...base,
          competitor_id: rivalId,
          captured_at: ago(age as number),
          followers,
          source: "apify",
        })),
      )
      .select("id"),
    "takipçi ölçümleri",
  );

  return { wsId: ws.id, own: { kind: "own", id: own.id }, rival: { kind: "competitor", id: rivalId }, ids };
}

const target = await connectLocalSupabase();
const title = `skor yeniden hesaplama (lokal Supabase)${target.skip ? ` — atlandı: ${target.skip}` : ""}`;
if (target.skip) console.warn(`[scoring] DB entegrasyon testi atlandı: ${target.skip}`);

describe.skipIf(target.skip !== undefined)(title, () => {
  const client = target.client as AdminClient;
  const store = createSupabaseScoringStore(client);
  // Küçük sayfa/parça boyutları: sayfalama ve parçalı okuma/yazma gerçek DB'de sonucu değiştirmemeli.
  const tinyStore = createSupabaseScoringStore(client, { pageSize: 4, idsPerRead: 3, rowsPerWrite: 5, concurrency: 2 });
  let wsId: string | undefined;
  let s: Seeded;

  beforeAll(async () => {
    s = await seed(client, (id) => (wsId = id));
  });

  afterAll(async () => {
    if (!wsId) return;
    const { error } = await client.from("workspaces").delete().eq("id", wsId);
    if (error) throw new Error(`test çalışma alanı silinemedi (${error.message})`);
    const left = await client.from("content_items").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
    expect(left.count).toBe(0);
  });

  async function readScores() {
    const rows = must(await client.from("content_items").select(SCORE_SELECT).eq("workspace_id", s.wsId), "skorlar");
    return new Map(rows.map((row) => [row.external_id, row]));
  }

  it("rakip: lift / kademe / düşük güven / baz çizgisi dışı sayaçlar beklendiği gibi", async () => {
    const result = await recomputeAccountScores(s.wsId, s.rival, NOW, { store });
    expect(result).toEqual({ owner: s.rival, items: RIVAL_COUNT, followers: 10_000 });

    const rows = await readScores();
    const hit = rows.get("hit");
    expect(hit).toMatchObject({
      views_kind: "ig_play_count",
      baseline_views: 1500,
      baseline_n: 11,
      lift: 6,
      lift_tier: 4,
      low_confidence: false,
      immature: false,
      baseline_excluded: { self: 1, otherFormat: 1, pinned: 1, noViews: 1, differentViewsKind: 1, noDate: 1, tooYoung: 1 },
    });
    expect(hit?.cross_score).toBeCloseTo(Math.log(0.9) * Math.log(10_000), 9);
    expect(new Date(hit?.scored_at as string).toISOString()).toBe(NOW.toISOString());
    const basis = hit?.baseline_basis as BaselineBasisJson[];
    expect(basis.map((b) => b.contentItemId)).toEqual(Array.from({ length: 11 }, (_, i) => s.ids.get(`n${i + 1}`)));

    // En son ölçüm kullanılır (eski 5000 değil 1000): baz çizgisi n2..n11 + tutan → medyan 1600.
    expect(rows.get("n1")).toMatchObject({ baseline_views: 1600, baseline_n: 11, lift: 0.625, lift_tier: 0 });
    expect(rows.get("young")).toMatchObject({ immature: true, baseline_n: 12, baseline_views: 1550 });
    expect(rows.get("nodate")).toMatchObject({ immature: false, baseline_n: 12 });
    // views yoksa lift NULL (0 değil); boş baz çizgisi → medyan NULL + düşük güven.
    expect(rows.get("unmeasured")).toMatchObject({
      views_kind: null,
      baseline_views: null,
      baseline_n: 0,
      lift: null,
      lift_tier: null,
      low_confidence: true,
      cross_score: null,
    });
    expect(rows.get("carousel")).toMatchObject({ lift: null, lift_tier: null, cross_score: null });
    const other = rows.get("otherkind");
    expect(other).toMatchObject({ views_kind: "ig_view_count", baseline_n: 0, lift: null, low_confidence: true });
    expect(other?.cross_score).toBeCloseTo(Math.log(0.5) * Math.log(10_000), 9);
  });

  it("kendi hesap: takipçi yoksa cross_score NULL; n < 10 → düşük güven ama lift hesaplanır", async () => {
    const result = await recomputeAccountScores(s.wsId, s.own, NOW, { store });
    expect(result).toEqual({ owner: s.own, items: OWN_COUNT, followers: undefined });

    const rows = await readScores();
    expect(rows.get("o5")).toMatchObject({
      views_kind: "ig_views",
      baseline_views: 1500,
      baseline_n: 4,
      lift: 2,
      lift_tier: 2,
      low_confidence: true,
    });
    for (let i = 1; i <= OWN_COUNT; i++) expect(rows.get(`o${i}`)?.cross_score).toBeNull();
  });

  it("ikinci çalıştırma aynı sonucu verir; küçük sayfa/parçalarla da aynı (idempotent)", async () => {
    const before = await readScores();
    await recomputeAccountScores(s.wsId, s.rival, NOW, { store: tinyStore });
    await recomputeAccountScores(s.wsId, s.own, NOW, { store: tinyStore });
    expect(await readScores()).toEqual(before);
  });

  it("çalışma alanı: kendi hesap + izlenen rakip skorlanır, yoksayılan rakip skorlanmaz", async () => {
    const before = await readScores();
    const result = await recomputeWorkspaceScores(s.wsId, NOW, { store });
    expect(result.failures).toEqual([]);
    expect(result.owners.map((o) => o.owner)).toEqual([s.own, s.rival]);
    expect(result.items).toBe(RIVAL_COUNT + OWN_COUNT);

    const after = await readScores();
    expect(after).toEqual(before);
    expect(after.get("x1")).toMatchObject({ scored_at: null, lift: null, baseline_excluded: null });
  });
});
