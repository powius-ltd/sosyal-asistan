/**
 * Yerel içe alma: rakip ekleme (izlenen), profil + içerik ingest'i, skor. Para harcamaz: koşu kaydı 0 USD, Apify çağrısı yok.
 * Normalize TikTok modülünden geçer (gizlilik orada süzülür). Mevcut `ingestProfiles` / `ingestContent` / `recomputeWorkspaceScores` kullanılır.
 */
import "server-only";

import type { ImportRow } from "@/lib/collection/local-import/plan";
import { ingestContent } from "@/lib/collection/ingest-content";
import { ingestProfiles } from "@/lib/collection/ingest-profile";
import { markRunFinished, reserveBudget } from "@/lib/apify/budget";
import { normalizeProfile } from "@/lib/platforms/tiktok/normalize-profile";
import { parseContent } from "@/lib/platforms/tiktok/normalize-content";
import { recomputeWorkspaceScores } from "@/lib/scoring";
import type { ScoringOwner } from "@/lib/scoring/types";
import type { AdminClient } from "@/lib/supabase/admin";

export interface ImportedRival {
  handle: string;
  owner: ScoringOwner;
  created: boolean;
  /** Bu rakibin içe alınan satırları. */
  rows: ImportRow[];
}

/** Yazarı `tracked` rakip yapar (aynı platform). Varsa atlanır; izlenmiyorsa (candidate) izlemeye alınır. */
export async function ensureTrackedRival(client: AdminClient, workspaceId: string, handle: string): Promise<{ id: string; created: boolean }> {
  const found = await client.from("competitors").select("id, status").eq("workspace_id", workspaceId).eq("platform", "tiktok").eq("handle", handle).maybeSingle();
  if (found.error) throw new Error(`Rakip okunamadı: ${found.error.message}`);
  if (found.data) {
    if (found.data.status !== "tracked" && found.data.status !== "ignored") {
      const up = await client.from("competitors").update({ status: "tracked" }).eq("id", found.data.id).eq("workspace_id", workspaceId);
      if (up.error) throw new Error(`Rakip izlemeye alınamadı: ${up.error.message}`);
    }
    return { id: found.data.id, created: false };
  }
  const ins = await client
    .from("competitors")
    .insert({ workspace_id: workspaceId, platform: "tiktok", handle, status: "tracked", source: "manual", missing_fields: ["followers", "following", "postsCount"] })
    .select("id")
    .single();
  if (ins.error) throw new Error(`Rakip eklenemedi: ${ins.error.message}`);
  return { id: ins.data.id, created: true };
}

async function openLocalRun(client: AdminClient, workspaceId: string, kind: "profile" | "content", label: string): Promise<string> {
  const run = await reserveBudget(workspaceId, "apify", 0, { kind, targetLabel: label }, { client });
  // Gerçek tutar bilinir: 0 (Apify çağrısı yok) → "mutabakat bekliyor" görünmesin.
  const { error } = await client.from("collection_runs").update({ actual_usd: 0 }).eq("id", run.id);
  if (error) throw new Error(`Koşu tutarı yazılamadı: ${error.message}`);
  return run.id;
}

export interface IngestSummary {
  rivalsAdded: number;
  rivalsExisting: number;
  contentItems: number;
  snapshots: number;
  scored: number;
}

export async function ingestRivalRows(client: AdminClient, workspaceId: string, rivals: ImportedRival[], now: Date): Promise<IngestSummary> {
  const summary: IngestSummary = { rivalsAdded: 0, rivalsExisting: 0, contentItems: 0, snapshots: 0, scored: 0 };
  for (const rival of rivals) {
    if (rival.created) summary.rivalsAdded++;
    else summary.rivalsExisting++;
    const label = `@${rival.handle} (yerel içe alma)`;
    const profile = normalizeProfile(rival.rows[0].raw);
    if (!profile.ok) throw new Error(`@${rival.handle} profili okunamadı: ${profile.reason}`);
    const profileRun = await openLocalRun(client, workspaceId, "profile", label);
    await ingestProfiles({ workspaceId, collectionRunId: profileRun, entries: [{ owner: rival.owner, profile: profile.value }], now }, { client });
    await markRunFinished(profileRun, { status: "ingested", itemCount: 1 }, { client });

    const parsed = parseContent(rival.rows.map((r) => r.raw));
    const contentRun = await openLocalRun(client, workspaceId, "content", label);
    const res = await ingestContent(
      { workspaceId, owner: rival.owner, items: parsed.items, collectionRunId: contentRun, ownerFollowers: profile.value.followers, now },
      { client },
    );
    await markRunFinished(contentRun, { status: "ingested", itemCount: parsed.items.length }, { client });
    summary.contentItems += res.contentItems;
    summary.snapshots += res.snapshots;
  }
  summary.scored = (await recomputeWorkspaceScores(workspaceId, now)).items;
  return summary;
}
