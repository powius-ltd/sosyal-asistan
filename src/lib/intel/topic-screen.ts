/**
 * Konu eleği adımı (LLM, Claude CLI): rakip içeriklerin açıklamasından "niş içi mi + konu" kararı → `content_topic_screens`.
 * Sayılabilen hiçbir şey LLM'e sorulmaz. Metni olmayan içerik modele gitmez ve satır YAZILMAZ (karar verilemez ≠ niş dışı); modelin
 * `unsure` dediği içerik de aynı: satır yazılmaz, `unsure` listesinde döner.
 * Her başarılı parti ayrı bir abonelik `collection_runs` satırıdır; eleği yazılan içeriğin `run_id`'si kendi partisinin koşusudur.
 * Bir parti başarısızsa diğer partilerin sonucu korunur; başarısız partinin içerikleri elenmemiş kalır (sonraki koşuda yeniden denenir).
 */
import "server-only";

import type { ScreenInfo } from "@/lib/intel/content-load";
import { saveTopicScreens } from "@/lib/intel/analysis-store";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { screenTopicsBatched, SCREEN_BATCH_MAX, type ScreenTopicsItem } from "@/lib/llm/screen-topics";
import type { LlmBackend, LlmCallMeta } from "@/lib/llm/types";
import type { AdminClient } from "@/lib/supabase/admin";

export interface ScreenStepInput {
  client: AdminClient;
  llm: LlmBackend;
  workspaceId: string;
  niche: string;
  items: readonly ScreenTopicsItem[];
  now: Date;
  model?: string;
  log: (line: string) => void;
}

export interface ScreenStepResult {
  screens: Map<string, ScreenInfo>;
  /** Niş dışı bulunanların sayısı. */
  offNiche: number;
  /** Metni olmadığı için elenemeyenler. */
  unscreenable: number;
  /** Modelin karar veremedikleri (niş dışı DEĞİL): satır yazılmaz; çağıran bu koşuda niş içi sayar. */
  unsure: string[];
  /** Elenemeyen (parti hatası) içerik sayısı. */
  failed: number;
}

const chunk = <T>(items: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export async function screenAndSave(input: ScreenStepInput): Promise<ScreenStepResult> {
  const { client, workspaceId } = input;
  const outcome = await screenTopicsBatched(input.llm, { niche: input.niche, items: input.items }, { model: input.model });

  // Başarılı partilerin koşu kimliği: gönderilebilir öğeler sırayla 10'luk partilere bölünür; başarısız parti metası üretmez.
  const failedIds = new Set(outcome.failed.flatMap((entry) => entry.ids));
  const unscreenable = new Set(outcome.unscreenable);
  const sendable = input.items.filter((item) => !unscreenable.has(item.id));
  const runOfId = new Map<string, { runId: string; meta: LlmCallMeta }>();
  let metaIndex = 0;
  for (const batch of chunk(sendable, SCREEN_BATCH_MAX)) {
    if (failedIds.has(batch[0].id)) continue;
    const meta = outcome.metas[metaIndex++];
    const runId = await recordLlmRun(client, workspaceId, meta, `konu eleği (${batch.length} içerik)`, batch.length);
    for (const item of batch) runOfId.set(item.id, { runId, meta });
  }
  for (const failure of outcome.failed) {
    input.log(`  konu eleği partisi başarısız (${failure.ids.length} içerik): ${failure.error.message.slice(0, 160)}`);
    await recordFailedLlmRun(client, workspaceId, "llm_topic_screen", `konu eleği (${failure.ids.length} içerik)`, failure.error.message);
  }

  // Yazım: parti başına (aynı run_id/model). Sonuçlar girdi sırasında.
  const byRun = new Map<string, typeof outcome.results>();
  for (const result of outcome.results) {
    const run = runOfId.get(result.id);
    const key = run?.runId ?? "";
    byRun.set(key, [...(byRun.get(key) ?? []), result]);
  }
  for (const [runId, results] of byRun) {
    const meta = runId === "" ? undefined : runOfId.get(results[0].id)?.meta;
    await saveTopicScreens(client, results, { workspaceId, promptVersion: outcome.promptVersion, model: meta?.model, runId: runId === "" ? undefined : runId, now: input.now });
  }

  const screens = new Map<string, ScreenInfo>(outcome.results.map((r) => [r.id, { inNiche: r.inNiche, ...(r.topic === "" ? {} : { topic: r.topic }), promptVersion: outcome.promptVersion }]));
  return {
    screens,
    offNiche: outcome.results.filter((r) => !r.inNiche).length,
    unscreenable: outcome.unscreenable.length,
    unsure: outcome.unsure,
    failed: failedIds.size,
  };
}
