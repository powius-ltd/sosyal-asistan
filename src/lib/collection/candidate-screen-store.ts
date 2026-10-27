/**
 * Aday niş eleğinin veritabanı erişimi (yalnız sunucu, service role): elenecek adayların metni, niş özeti, tutan oranı sayıları ve
 * `competitor_screens` yazımı / okuması. Aday durumu (`status`) bu dosyada HİÇ değişmez; izlemeye alma kullanıcı kararıdır.
 */
import "server-only";

import { HIT_LIFT_MIN, type CandidateLiftStats, type CandidateScreenInfo } from "@/lib/collection/candidate-rank";
import { DISCOVER_LIMITS, searchQueriesOf } from "@/lib/collection/discover-candidates";
import { CANDIDATE_CAPTIONS_MAX, type CandidateScreenResult, type ScreenCandidateItem } from "@/lib/llm/screen-candidates";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/platforms/types";

/** Toplanmış son kaç videonun tutan oranına bakılır. */
export const LIFT_WINDOW = 25;
const NICHE_TAG_COUNT = 5;

const fail = (what: string, message: string): never => {
  throw new Error(`Aday eleği: ${what} (${message}).`);
};

export interface ScreenableCandidate extends ScreenCandidateItem {
  handle: string;
  platform: Platform;
  followers?: number;
  source: string;
}

/** Niş tarifi: çalışma alanının niş özeti; yoksa kendi içeriğin en sık etiketleri; ikisi de yoksa undefined (elek `unsure` döner). */
export async function loadNicheBrief(client: AdminClient, workspaceId: string): Promise<string | undefined> {
  const { data, error } = await client.from("workspaces").select("niche_brief").eq("id", workspaceId).maybeSingle();
  if (error) fail("niş özeti okunamadı", error.message);
  const brief = data?.niche_brief?.trim();
  if (brief) return brief;
  const { data: rows, error: tagError } = await client
    .from("content_items")
    .select("hashtags")
    .eq("workspace_id", workspaceId)
    .not("social_account_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(DISCOVER_LIMITS.ownContentWindow);
  if (tagError) fail("kendi etiketler okunamadı", tagError.message);
  const tags = searchQueriesOf((rows ?? []).map((row) => row.hashtags ?? []), NICHE_TAG_COUNT);
  return tags.length === 0 ? undefined : `Hesap sahibinin en sık paylaştığı konular (etiketler): ${tags.join(", ")}.`;
}

/** Aday satırları + biyografi + son açıklamalar (kaynak sırası: en yeni önce). */
export async function loadScreenableCandidates(client: AdminClient, workspaceId: string, statuses: readonly string[] = ["candidate"]): Promise<ScreenableCandidate[]> {
  const { data, error } = await client
    .from("competitors")
    .select("id, platform, handle, followers, source, bio")
    .eq("workspace_id", workspaceId)
    .in("status", [...statuses])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail("adaylar okunamadı", error.message);
  const rows = data ?? [];
  const captions = new Map<string, string[]>();
  if (rows.length > 0) {
    const { data: contents, error: contentError } = await client
      .from("content_items")
      .select("competitor_id, caption, published_at")
      .eq("workspace_id", workspaceId)
      .in("competitor_id", rows.map((row) => row.id))
      .not("caption", "is", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (contentError) fail("aday açıklamaları okunamadı", contentError.message);
    for (const content of contents ?? []) {
      const list = captions.get(content.competitor_id ?? "") ?? [];
      if (list.length < CANDIDATE_CAPTIONS_MAX && content.caption && content.caption.trim() !== "") captions.set(content.competitor_id ?? "", [...list, content.caption]);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    platform: row.platform,
    source: row.source,
    ...(row.followers === null ? {} : { followers: Number(row.followers) }),
    ...(row.bio === null || row.bio.trim() === "" ? {} : { bio: row.bio }),
    captions: captions.get(row.id) ?? [],
  }));
}

/** Aday başına son ≤ 25 videoda ölçülmüş lift sayısı ve ≥ 3x olanlar. Videosu / lifti olmayan aday haritada yok (nötr). */
export async function loadLiftStats(client: AdminClient, workspaceId: string, competitorIds: readonly string[]): Promise<Map<string, CandidateLiftStats>> {
  const stats = new Map<string, CandidateLiftStats>();
  if (competitorIds.length === 0) return stats;
  const { data, error } = await client
    .from("content_items")
    .select("competitor_id, lift")
    .eq("workspace_id", workspaceId)
    .in("competitor_id", [...competitorIds])
    .not("lift", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(competitorIds.length * LIFT_WINDOW);
  if (error) fail("tutan oranı okunamadı", error.message);
  for (const row of data ?? []) {
    const id = row.competitor_id ?? "";
    const current = stats.get(id) ?? { videos: 0, hits: 0 };
    if (current.videos >= LIFT_WINDOW || row.lift === null) continue;
    stats.set(id, { videos: current.videos + 1, hits: current.hits + (row.lift >= HIT_LIFT_MIN ? 1 : 0) });
  }
  return stats;
}

export async function loadScreens(client: AdminClient, workspaceId: string): Promise<Map<string, CandidateScreenInfo>> {
  const { data, error } = await client.from("competitor_screens").select("competitor_id, fit, reason").eq("workspace_id", workspaceId);
  if (error) fail("eleme sonuçları okunamadı", error.message);
  return new Map((data ?? []).map((row) => [row.competitor_id, { fit: row.fit as CandidateScreenInfo["fit"], ...(row.reason === null ? {} : { reason: row.reason }) }]));
}

export interface SaveScreensContext {
  workspaceId: string;
  promptVersion: string;
  model?: string;
  runId?: string;
  now: Date;
}

/** Sonuçları yazar (aday başına güncel satır). Aday `status`'una dokunmaz. */
export async function saveCandidateScreens(client: AdminClient, candidates: readonly Pick<ScreenableCandidate, "id" | "platform">[], results: readonly CandidateScreenResult[], ctx: SaveScreensContext): Promise<void> {
  const platformOf = new Map(candidates.map((candidate) => [candidate.id, candidate.platform]));
  const rows = results.flatMap((result) => {
    const platform = platformOf.get(result.id);
    return platform === undefined
      ? []
      : [{
          competitor_id: result.id,
          workspace_id: ctx.workspaceId,
          platform,
          fit: result.fit,
          reason: result.reason === "" ? null : result.reason.slice(0, 300),
          quote: result.quote === undefined ? null : result.quote.slice(0, 300),
          prompt_version: ctx.promptVersion,
          model: ctx.model ?? null,
          run_id: ctx.runId ?? null,
          screened_at: ctx.now.toISOString(),
        }];
  });
  if (rows.length === 0) return;
  const { error } = await client.from("competitor_screens").upsert(rows, { onConflict: "competitor_id" });
  if (error) fail("sonuçlar yazılamadı", error.message);
}
