/**
 * Yerel içe alma: içe alınan videoların `agy` analizi. Koşu kaydı `runAnalysis` desenindedir (abonelik, `video_analysis`).
 * Sıralı çalışır (RAM paylaşımlı sunucu). Analiz fırlatmaz; DB yazım hatası koşuyu kapatıp yukarı gider.
 */
import "server-only";

import type { ImportRow } from "@/lib/collection/local-import/plan";
import { closeRun, openSubscriptionRun } from "@/lib/intel/run-log";
import { saveAnalysis } from "@/lib/intel/analysis-store";
import type { AdminClient } from "@/lib/supabase/admin";
import { analyzeLocalVideo } from "@/lib/video-analysis/analyze-local";

export interface AnalyzeSummary {
  ok: number;
  insufficient: number;
  failed: number;
  lines: string[];
}

export async function analyzeImported(client: AdminClient, workspaceId: string, rows: ImportRow[], log: (line: string) => void): Promise<AnalyzeSummary> {
  const found = await client
    .from("content_items")
    .select("id, external_id, caption, duration_sec")
    .eq("workspace_id", workspaceId)
    .eq("platform", "tiktok")
    .in("external_id", rows.map((r) => r.videoId));
  if (found.error) throw new Error(`İçerik okunamadı: ${found.error.message}`);
  const summary: AnalyzeSummary = { ok: 0, insufficient: 0, failed: 0, lines: [] };
  for (const row of rows) {
    const item = found.data.find((d) => d.external_id === row.videoId);
    const label = `@${row.handle} ${row.videoId}`;
    if (!item) {
      summary.failed++;
      log(`${label}: içerik satırı yok, atlandı.`);
      continue;
    }
    log(`${label} analiz ediliyor...`);
    const run = await openSubscriptionRun(client, workspaceId, "gemini", "video_analysis", label);
    try {
      const result = await analyzeLocalVideo(
        { contentId: item.id, isCompetitor: true, caption: item.caption ?? undefined, durationSec: item.duration_sec ?? undefined },
        row.file,
      );
      await saveAnalysis(client, result, { workspaceId, runId: run.id, ownerHandle: row.handle });
      await closeRun(client, run.id, {
        ok: result.status !== "failed",
        error: result.status === "failed" ? result.failure.message : undefined,
        itemCount: 1,
        inputTokens: result.stats.inputTokens,
        outputTokens: result.stats.outputTokens,
        model: result.model,
      });
      if (result.status === "ok") summary.ok++;
      else if (result.status === "insufficient_data") summary.insufficient++;
      else summary.failed++;
      log(`${label} → ${result.status === "failed" ? `failed (${result.failure.kind}: ${result.failure.message})` : result.status} (${Math.round(result.stats.durationMs / 1000)} sn)`);
    } catch (error) {
      await closeRun(client, run.id, { ok: false, error: error instanceof Error ? error.message : "bilinmeyen hata" }).catch(() => undefined);
      throw error;
    }
  }
  return summary;
}
