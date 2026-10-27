/**
 * Analiz sonuçlarının DB yazımı (service role; her satır açıkça `workspace_id` ile): `transcripts` + `content_analyses`
 * (içerik başına tek satır; yeniden analiz üzerine yazar) ve `content_topic_screens` (konu eleği). Saf eşleme: `analysis-rows.ts`.
 * Video dosyası/adresi HİÇBİR yere yazılmaz.
 */
import "server-only";

import { toAnalysisRow, toTranscriptRow, type AnalysisRowContext } from "@/lib/intel/analysis-rows";
import type { TopicScreenResult } from "@/lib/llm/screen-topics";
import type { AdminClient } from "@/lib/supabase/admin";
import type { VideoAnalysisResult } from "@/lib/video-analysis/types";

function fail(what: string, message: string): Error {
  return new Error(`${what} yazılamadı: ${message}`);
}

/** Bir analiz sonucunu yazar: transcript (varsa) + analiz. Transcript önce yazılır; analiz hatası transcript'i geri almaz (idempotent yeniden deneme). */
export async function saveAnalysis(client: AdminClient, result: VideoAnalysisResult, ctx: AnalysisRowContext): Promise<void> {
  if (result.status !== "failed") {
    const { error } = await client
      .from("transcripts")
      .upsert(toTranscriptRow(result.transcript, { workspaceId: ctx.workspaceId, contentId: result.contentId }), { onConflict: "content_item_id" });
    if (error) throw fail("Transcript", error.message);
  }
  const { error } = await client.from("content_analyses").upsert(toAnalysisRow(result, ctx), { onConflict: "content_item_id" });
  if (error) throw fail("Analiz", error.message);
}

export interface ScreenWriteContext {
  workspaceId: string;
  promptVersion: string;
  model?: string;
  runId?: string;
  now: Date;
}

/** Konu eleği sonuçlarını yazar (içerik başına güncel satır). Metni olmayan içerik için satır yazılmaz (çağıran sonuç vermez). */
export async function saveTopicScreens(client: AdminClient, results: readonly TopicScreenResult[], ctx: ScreenWriteContext): Promise<void> {
  if (results.length === 0) return;
  const rows = results.map((result) => ({
    workspace_id: ctx.workspaceId,
    content_item_id: result.id,
    in_niche: result.inNiche,
    topic: result.topic === "" ? null : result.topic.slice(0, 80),
    reason: result.reason === "" ? null : result.reason.slice(0, 300),
    prompt_version: ctx.promptVersion,
    model: ctx.model ?? null,
    run_id: ctx.runId ?? null,
    screened_at: ctx.now.toISOString(),
  }));
  const { error } = await client.from("content_topic_screens").upsert(rows, { onConflict: "content_item_id" });
  if (error) throw fail("Konu eleği", error.message);
}
