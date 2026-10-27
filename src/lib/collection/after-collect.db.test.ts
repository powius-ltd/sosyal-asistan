/**
 * Entegrasyon: lokal Supabase'te KENDİ test çalışma alanını kurar (seed çalışma alanına dokunmaz) ve toplama sonrası döngü
 * işlerini uçtan uca doğrular: içerik bekleyen bağ çözülür (fikir `published`), yeni Reels için YALNIZ `suggested` öneri yazılır
 * (sessiz bağ yok), ölçümü gelen Reels için bildirim yazılır ve ikinci tur HİÇBİRİNİ yinelemez. Sonra çalışma alanını siler.
 * Supabase yoksa atlanır (neden başlıkta). Apify çağrısı yok.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { afterCollect } from "@/lib/collection/after-collect";
import { checkMeasurementDue } from "@/lib/outcomes/notify";
import { connectLocalSupabase } from "@/lib/scoring/db-test-client";
import type { AdminClient } from "@/lib/supabase/admin";
import { DAY_MS } from "@/lib/time";

const NOW = new Date("2026-10-12T09:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const HOOK = "Fiyatını yükseltmeden önce bu üç soruyu sor";

type Result = { data: unknown; error: { message: string } | null };

function must<R extends Result>(result: R, what: string): NonNullable<R["data"]> {
  const { data, error } = result;
  if (error || data === null || data === undefined) throw new Error(`test kurulumu: ${what} (${error?.message ?? "veri yok"})`);
  return data as NonNullable<R["data"]>;
}

const target = await connectLocalSupabase();
const title = `toplama sonrası döngü işleri (lokal Supabase)${target.skip ? ` — atlandı: ${target.skip}` : ""}`;

describe.skipIf(target.skip !== undefined)(title, () => {
  const client = target.client as AdminClient;
  let wsId: string;
  const idea: Record<"match" | "waiting" | "other", string> = { match: "", waiting: "", other: "" };
  let reelNew: string;

  async function ideaStatus(id: string): Promise<string> {
    return must(await client.from("ideas").select("status").eq("id", id).single(), "fikir").status;
  }

  beforeAll(async () => {
    wsId = must(await client.from("workspaces").insert({ name: "Döngü testi", slug: `test-dongu-${randomUUID().slice(0, 8)}` }).select("id").single(), "workspace").id;
    const base = { workspace_id: wsId, platform: "instagram" as const };
    const accountId = must(await client.from("social_accounts").insert({ ...base, handle: "test_kendi", followers: 1000 }).select("id").single(), "hesap").id;

    const newIdea = async (title: string, hooks: string[]) =>
      must(await client.from("ideas").insert({ ...base, format: "short_video", title, hooks }).select("id").single(), "fikir").id;
    idea.match = await newIdea("Fiyat soruları", [HOOK]);
    idea.waiting = await newIdea("Bekleyen link", []);
    idea.other = await newIdea("Tamamen başka konu", ["Sabah rutini nasıl kurulur"]);

    const newReel = async (shortcode: string, caption: string, publishedDaysAgo: number) =>
      must(
        await client
          .from("content_items")
          .insert({ ...base, social_account_id: accountId, external_id: `ext_${shortcode}`, shortcode, format: "short_video", caption, published_at: daysAgo(publishedDaysAgo), duration_sec: 30 })
          .select("id")
          .single(),
        "içerik",
      ).id;
    reelNew = await newReel("RNEW1", HOOK, 1.5); // D+1 penceresi açık, ölçümü yok
    await newReel("RAWAIT", "tamamen alakasız bir açıklama", 4); // D+3 penceresi açık
    must(
      await client.from("idea_content_links").insert({ workspace_id: wsId, idea_id: idea.waiting, shortcode: "RAWAIT", status: "awaiting_content", origin: "manual_url" }).select("id").single(),
      "bekleyen bağ",
    );
  });

  afterAll(async () => {
    if (!wsId) return;
    const { error } = await client.from("workspaces").delete().eq("id", wsId);
    if (error) throw new Error(`test çalışma alanı silinemedi (${error.message})`);
  });

  async function notifications() {
    return must(await client.from("notifications").select("kind, dedupe_key").eq("workspace_id", wsId).order("dedupe_key"), "bildirimler");
  }

  it("bekleyen bağ çözülür, yeni Reels için YALNIZ öneri yazılır, ölçüm bildirimleri yazılır", async () => {
    const summary = await afterCollect(client, wsId, NOW);
    expect(summary.notes).toEqual([]);
    expect(summary).toMatchObject({ resolved: 1, suggested: 1, suggestionNotifications: 1, dueCount: 2, dueNotifications: 2 });

    // Bekleyen bağ → onaylı: fikir published (trigger).
    expect(await ideaStatus(idea.waiting)).toBe("published");
    // Öneri: fikir DEĞİŞMEZ, bağ yalnız `suggested` (sessiz bağ yok).
    expect(await ideaStatus(idea.match)).toBe("new");
    const links = must(await client.from("idea_content_links").select("idea_id, status, origin, score, content_item_id").eq("workspace_id", wsId), "bağlar");
    const suggestion = links.find((l) => l.idea_id === idea.match);
    expect(suggestion).toMatchObject({ status: "suggested", origin: "auto_match", content_item_id: reelNew });
    expect(suggestion?.score).toBeGreaterThanOrEqual(0.45);
    expect(links.filter((l) => l.status === "confirmed").map((l) => l.idea_id)).toEqual([idea.waiting]);
    expect(links.some((l) => l.idea_id === idea.other)).toBe(false);

    expect((await notifications()).map((n) => n.kind).sort()).toEqual(["idea_link_suggested", "measurement_due", "measurement_due"]);
  });

  it("ikinci tur hiçbir şeyi yinelemez (çözüm, öneri, bildirim)", async () => {
    const before = await notifications();
    const summary = await afterCollect(client, wsId, NOW);
    expect(summary).toMatchObject({ resolved: 0, suggested: 0, suggestionNotifications: 0, dueNotifications: 0 });
    expect(await notifications()).toEqual(before);
    const links = must(await client.from("idea_content_links").select("id").eq("workspace_id", wsId), "bağlar");
    expect(links).toHaveLength(2);
  });

  it("measure:check yolu: ölçümü gelenleri bulur, yeni bildirim yazmaz (aynı olay bir kez)", async () => {
    const check = await checkMeasurementDue(client, wsId, NOW);
    expect(check.due.map((d) => [d.shortcode, d.day]).sort()).toEqual([["RAWAIT", 3], ["RNEW1", 1]]);
    expect(check.created).toBe(0);
    // Onaylı bağlı Reels'in satırı fikrini taşır.
    expect(check.due.find((d) => d.shortcode === "RAWAIT")?.ideaId).toBe(idea.waiting);
  });
});
