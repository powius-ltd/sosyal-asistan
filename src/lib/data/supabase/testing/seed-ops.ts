/**
 * Sözleşme süiti test verisi (3/3): koşular, yayın işleri (her durum), koleksiyonlar ve bildirimler. Yayın işleri gerçek
 * yoldan üretilir: `draft → awaiting_approval → approved → published` (DB trigger'ı onayı yalnız editör/sahip üyeyle yazar).
 */
import { collectionNameKey } from "@/lib/domain/collection";
import { DAY_MS } from "@/lib/time";
import type { AdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { SeedItem } from "@/lib/data/supabase/testing/seed-content";

/** Hata varsa açık mesajla fırlatır (seed bozuksa süit anlamsızdır). */
export function must<T extends { error: { message: string } | null }>(result: T, what: string): T {
  if (result.error) throw new Error(`Test verisi yazılamadı (${what}): ${result.error.message}`);
  return result;
}

const minutes = (now: Date, ago: number) => new Date(now.getTime() - ago * 60_000);

export async function seedRuns(db: AdminClient, wsId: string, now: Date): Promise<void> {
  type Run = Omit<TablesInsert<"collection_runs">, "workspace_id">;
  const run = (agoMin: number, r: Run & { durationMin?: number }): TablesInsert<"collection_runs"> => {
    const { durationMin, ...rest } = r;
    const started = minutes(now, agoMin);
    const finished = rest.status === "reserved" || rest.status === "running" ? null : new Date(started.getTime() + (durationMin ?? 3) * 60_000).toISOString();
    // Apify'da tutar yalnız `usage_settled_at` ile kesindir; açıkça verilmediyse tutarı olan koşu kesinleşmiş sayılır.
    const settled = rest.provider === "apify" && rest.actual_usd !== null && rest.actual_usd !== undefined ? finished : null;
    return {
      workspace_id: wsId,
      // Toplu insert'te eksik anahtar NULL yazılır (DEFAULT değil): NOT NULL sütunlar her satırda verilir.
      price_unknown: false,
      billing: "metered",
      usage_settled_at: settled,
      model: null,
      ...rest,
      started_at: started.toISOString(),
      finished_at: finished,
    };
  };
  const rows = [
    run(120, { provider: "apify", kind: "profile", status: "ingested", target_label: "@rakip.bir", reserved_usd: 0.02, actual_usd: 0.018, expected_results: 1, item_count: 1 }),
    run(180, { provider: "apify", kind: "content", status: "ingested", target_label: "@rakip.bir", reserved_usd: 0.06, actual_usd: 0.052, expected_results: 25, item_count: 24 }),
    run(60, { provider: "apify", kind: "content", status: "running", target_label: "@rakip.iki", reserved_usd: 0.06, actual_usd: null, expected_results: 25 }),
    run(300, { provider: "apify", kind: "discovery_related", status: "failed", target_label: "@rakip.bir", reserved_usd: 0.03, actual_usd: 0, error: "Aktör zaman aşımına uğradı." }),
    run(360, { provider: "apify", kind: "content", status: "succeeded", target_label: "@rakip.uc", reserved_usd: 0.5, actual_usd: null, price_unknown: true, expected_results: 30, item_count: 30 }),
    run(240, { provider: "anthropic", kind: "llm_analysis", status: "ingested", reserved_usd: 0.15, actual_usd: 0.12, input_tokens: 12000, output_tokens: 900 }),
    // Abonelik (Faz 2): tutar yok (actual_usd NULL, mutabakat konusu değil), yalnız çağrı sayılır.
    run(420, { provider: "claude_cli", kind: "llm_ideas", status: "succeeded", billing: "subscription", reserved_usd: 0, actual_usd: null, input_tokens: 20720, output_tokens: 18540 }),
    // Modeli kayıtlı koşular: gölge maliyet kayıtlı modelle fiyatlanır (Haiku ≠ varsayılan Sonnet); tabloda olmayan model fiyatlanmaz.
    run(410, { provider: "claude_cli", kind: "llm_topic_screen", status: "succeeded", billing: "subscription", reserved_usd: 0, actual_usd: null, input_tokens: 4134, output_tokens: 1297, model: "claude-haiku-5-5" }),
    run(405, { provider: "claude_cli", kind: "llm_chat", status: "succeeded", billing: "subscription", reserved_usd: 0, actual_usd: null, input_tokens: 8486, output_tokens: 948, model: "bilinmeyen-model-9" }),
    run(400, { provider: "gemini", kind: "video_analysis", status: "ingested", billing: "subscription", reserved_usd: 0, actual_usd: null, item_count: 1, input_tokens: 30508, output_tokens: 23280 }),
    run(390, { provider: "gemini", kind: "video_analysis", status: "failed", billing: "subscription", reserved_usd: 0, actual_usd: null, error: "agy 429: kota doldu." }),
    // Apify kullanımı kesinleşmedi: geçici actual_usd (alt sınır) var ama usage_settled_at NULL → domain'de actualUsd yok.
    run(90, { provider: "apify", kind: "content", status: "succeeded", target_label: "@rakip.iki", reserved_usd: 0.5, actual_usd: 0.03, usage_settled_at: null, expected_results: 25, item_count: 25 }),
    run(480, { provider: "apify", kind: "content", status: "aborted", target_label: "@yoksayilan", reserved_usd: 0.06, actual_usd: 0 }),
    run(540, { provider: "gemini", kind: "transcription", status: "timed_out", reserved_usd: 0.04, actual_usd: null, error: "Zaman aşımı." }),
    // Önceki ay: ay toplamına girmez (getCostSummary ay filtresi).
    { ...run(40 * 24 * 60, { provider: "apify", kind: "content", status: "ingested", reserved_usd: 0.5, actual_usd: 0.4, item_count: 20 }) },
  ];
  must(await db.from("collection_runs").insert(rows), "collection_runs");
}

/** Yayın işlerini gerçek durum yolundan üretir; onaylayan = `userId` (workspace sahibi üye). */
export async function seedPublishJobs(db: AdminClient, wsId: string, accountId: string, userId: string, now: Date): Promise<void> {
  const base = { workspace_id: wsId, social_account_id: accountId, platform: "instagram" as const };
  const insert = async (row: Partial<TablesInsert<"publish_jobs">>) => {
    const res = must(await db.from("publish_jobs").insert({ ...base, ...row }).select("id").single(), "publish_jobs");
    return res.data?.id as string;
  };
  const update = async (id: string, columns: Partial<TablesInsert<"publish_jobs">>) =>
    must(await db.from("publish_jobs").update(columns).eq("id", id).eq("workspace_id", wsId), "publish_jobs güncelle");
  const approve = async (id: string) => {
    await update(id, { status: "awaiting_approval" });
    await update(id, { status: "approved", approved_by: userId, approved_at: now.toISOString() });
  };

  await insert({ caption: "Taslak açıklama #kahve" });
  await insert({ caption: "Onay bekleyen açıklama", status: "awaiting_approval", scheduled_at: new Date(now.getTime() + DAY_MS).toISOString() });
  const approved = await insert({ caption: "Onaylanmış açıklama", scheduled_at: new Date(now.getTime() + 2 * DAY_MS).toISOString() });
  await approve(approved);
  const published = await insert({ caption: "Yayınlanmış açıklama" });
  await approve(published);
  await update(published, {
    status: "published",
    published_external_id: "ig_media_test_1",
    published_permalink: "https://www.instagram.com/reel/TESTPERMA/",
    published_at: now.toISOString(),
  });
  const cancelled = await insert({ caption: "İptal edilen açıklama" });
  await update(cancelled, { status: "cancelled" });
  const failed = await insert({ caption: "Başarısız açıklama" });
  await update(failed, { status: "failed", last_error: "Container hazırlanamadı." });
}

export async function seedCollections(db: AdminClient, wsId: string, items: SeedItem[], now: Date): Promise<void> {
  const named = (name: string, description: string | null) => ({ workspace_id: wsId, name, name_key: collectionNameKey(name), description });
  const created = must(
    await db.from("collections").insert([named("Kahve fikirleri", "Rakip tutanları"), named("Boş koleksiyon", null)]).select("id, name"),
    "collections",
  );
  const filled = created.data?.find((c) => c.name === "Kahve fikirleri");
  const picks = items.filter((i) => i.owner.handle === "rakip.bir" && i.views !== undefined).slice(0, 2);
  if (filled && picks.length > 0) {
    must(
      await db.from("collection_items").insert(
        picks.map((item, index) => ({
          collection_id: filled.id,
          content_item_id: item.id,
          workspace_id: wsId,
          note: index === 0 ? "İlham: hook güçlü" : null,
          added_at: minutes(now, 30 - index).toISOString(),
        })),
      ),
      "collection_items",
    );
  }
}

export async function seedNotifications(db: AdminClient, wsId: string, items: SeedItem[], now: Date): Promise<void> {
  const outlier = items.find((i) => i.owner.handle === "rakip.bir" && (i.views ?? 0) > 0);
  const own = items.find((i) => i.owner.kind === "own" && i.views !== undefined);
  const row = (agoMin: number, r: Omit<TablesInsert<"notifications">, "workspace_id" | "created_at">): TablesInsert<"notifications"> => ({
    workspace_id: wsId,
    created_at: minutes(now, agoMin).toISOString(),
    ...r,
  });
  must(
    await db.from("notifications").insert([
      row(10, { kind: "competitor_outlier", title: "@rakip.bir'in reel'i 5x tuttu", body: "Baz çizgisinin 5 katı izlendi.", content_item_id: outlier?.id ?? null }),
      row(20, { kind: "own_outlier", title: "Reel'in 3x tuttu", body: "Kendi içeriğin eşiği geçti.", content_item_id: own?.id ?? null }),
      row(30, { kind: "system", title: "Haftalık özet hazır", body: "Bu haftanın özeti hazır." }),
      row(60, { kind: "weekly_digest", title: "Geçen haftanın özeti", body: "Özet okundu.", read_at: minutes(now, 5).toISOString() }),
    ]),
    "notifications",
  );
}
