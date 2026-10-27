/**
 * Sözleşme süiti test workspace'i: `runRepositoryContract` için gereken seed'i (hesap, rakipler, içerik + skor + snapshot,
 * analiz, fikir, koşu, bitmiş panel işleri, her durumda yayın işi, koleksiyon, bildirim) SABİT OLMAYAN bir workspace'e yazar ve işi bitince siler
 * (cascade). Seed workspace'ine (`7a3f0000-…-0001`) DOKUNMAZ. Yalnız `*.db.test.ts` kullanır; uygulama koduna girmez.
 */
import { randomUUID } from "node:crypto";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  accountSnapshotRows,
  buildOwners,
  generateContent,
} from "@/lib/data/supabase/testing/seed-content";
import { buildBriefingRow } from "@/lib/data/supabase/testing/seed-briefing";
import { buildCreativeLabelRows } from "@/lib/data/supabase/testing/seed-creative";
import { buildIntel } from "@/lib/data/supabase/testing/seed-intel";
import { seedAds } from "@/lib/data/supabase/testing/seed-ads";
import { seedJobs } from "@/lib/data/supabase/testing/seed-jobs";
import { buildTopicClusterRows } from "@/lib/data/supabase/testing/seed-topics";
import { must, seedCollections, seedNotifications, seedPublishJobs, seedRuns } from "@/lib/data/supabase/testing/seed-ops";
import { seedWeeklyPlan } from "@/lib/data/supabase/testing/seed-plan";

/** Seed'in sözleşme süitine bildirdikleri: konu eleği depo üzerinden yazılamadığı için niş dışı içerik kimliklerini seed bilir. */
export interface ContractSeedInfo {
  offNicheContentIds: string[];
}

export async function seedContractWorkspace(db: AdminClient, wsId: string, userId: string, now: Date): Promise<ContractSeedInfo> {
  const ids = { ownConnected: randomUUID(), ownScrape: randomUUID(), c: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
  const plans = buildOwners(ids);
  const content = generateContent(wsId, plans, now);
  const followers = (handle: string) => content.owners.find((o) => o.handle === handle)?.followers ?? null;

  must(await db.from("workspaces").insert({ id: wsId, name: "Sözleşme testi", slug: `sozlesme-${wsId.slice(0, 8)}`, niche_brief: "Test niş tanımı" }), "workspaces");
  must(await db.from("workspace_members").insert({ workspace_id: wsId, user_id: userId, role: "owner" }), "workspace_members");

  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  must(
    await db.from("social_accounts").insert([
      {
        id: ids.ownConnected,
        workspace_id: wsId,
        platform: "instagram",
        handle: "test.hesap",
        external_id: "ig_test_ext_1",
        display_name: "Test Hesap",
        followers: followers("test.hesap"),
        connection: "connected",
        scopes: ["instagram_business_basic", "instagram_business_content_publish"],
        token_expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        last_synced_at: iso(3_600_000),
      },
      { id: ids.ownScrape, workspace_id: wsId, platform: "instagram", handle: "test.hesap2", followers: followers("test.hesap2"), connection: "scrape_only", scopes: [] },
    ]),
    "social_accounts",
  );

  const rival = (id: string, handle: string, status: string, extra: { followers?: number | null; source?: string; via?: string } = {}) => ({
    id,
    workspace_id: wsId,
    platform: "instagram" as const,
    handle,
    status,
    followers: extra.followers ?? followers(handle),
    source: extra.source ?? "manual",
    discovered_via: extra.via ?? null,
  });
  must(
    await db.from("competitors").insert([
      rival(ids.c[0], "rakip.bir", "tracked"),
      rival(ids.c[1], "rakip.iki", "tracked"),
      rival(ids.c[2], "rakip.uc", "tracked"),
      rival(ids.c[3], "yoksayilan", "ignored"),
      rival(randomUUID(), "aday.bir", "candidate", { followers: 4000, source: "related", via: "@rakip.bir" }),
      rival(randomUUID(), "aday.iki", "candidate", { followers: 900_000, source: "search", via: "kahve" }),
      rival(randomUUID(), "gizli.hesap", "private"),
      rival(randomUUID(), "yok.hesap", "not_found"),
    ]),
    "competitors",
  );

  must(await db.from("content_items").insert(content.itemRows), "content_items");
  must(await db.from("metric_snapshots").insert(content.snapshotRows), "metric_snapshots");
  must(await db.from("account_snapshots").insert(accountSnapshotRows(wsId, content.owners, now)), "account_snapshots");

  const lifts = new Map(content.itemRows.map((row) => [row.id as string, row.lift ?? undefined]));
  const intel = buildIntel(wsId, content.items, lifts, now);
  must(await db.from("transcripts").insert(intel.transcriptRows), "transcripts");
  must(await db.from("content_analyses").insert(intel.analysisRows), "content_analyses");
  must(await db.from("content_topic_screens").insert(intel.topicScreenRows), "content_topic_screens");
  must(
    await db.from("content_creative_labels").insert(buildCreativeLabelRows(wsId, content.items, intel.analysisRows, intel.offNicheContentIds, now)),
    "content_creative_labels",
  );
  must(
    await db.from("content_topic_clusters").insert(buildTopicClusterRows(wsId, content.items, intel.analysisRows, intel.offNicheContentIds, now)),
    "content_topic_clusters",
  );
  must(await db.from("ideas").insert(intel.ideaRows), "ideas");
  must(await db.from("idea_evidence").insert(intel.evidenceRows), "idea_evidence");

  await seedWeeklyPlan(db, wsId, {
    accountId: ids.ownConnected,
    rivalContentIds: content.items.filter((item) => item.owner.kind === "competitor" && item.format === "short_video").map((item) => item.id).slice(0, 3),
    ownContentIds: content.items.filter((item) => item.owner.kind === "own").map((item) => item.id),
    timeZone: "Europe/Istanbul",
    now,
  });
  // Analist brifingi: ref'ler seed'in kendi içeriğine ve bu haftanın planına bağlı.
  const ownContentId = content.items.find((item) => item.owner.kind === "own")?.id;
  if (ownContentId === undefined) throw new Error("seed: kendi içeriği yok (brifing ref'i için gerekli)");
  must(await db.from("agent_briefings").insert(buildBriefingRow(wsId, { ownContentId, now })), "agent_briefings");
  await seedAds(db, wsId, ownContentId);
  await seedRuns(db, wsId, now);
  await seedJobs(db, wsId, userId, now);
  await seedPublishJobs(db, wsId, ids.ownConnected, userId, now);
  await seedCollections(db, wsId, content.items, now);
  await seedNotifications(db, wsId, content.items, now);
  return { offNicheContentIds: intel.offNicheContentIds };
}

/** Test workspace'ini ve tüm bağlı kayıtlarını siler (FK cascade). */
export async function deleteContractWorkspace(db: AdminClient, wsId: string): Promise<void> {
  const { error } = await db.from("workspaces").delete().eq("id", wsId);
  if (error) throw new Error(`Test workspace'i silinemedi: ${error.message}`);
}
