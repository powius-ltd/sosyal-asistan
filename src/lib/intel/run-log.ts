/**
 * Abonelik çağrılarının `collection_runs` kaydı: her agy video analizi ve her LLM (Claude CLI) çağrısı BİR satırdır
 * (`billing = 'subscription'`, `reserved_usd` 0, `actual_usd` NULL; maliyet kartı "Abonelik: N agy / M Claude çağrısı").
 * Satır önce `reserveBudget` ile açılır (0 USD: tavana takılmaz), iş bitince `closeRun` ile kapanır. Yalnız service role.
 */
import "server-only";

import { markRunFinished, reserveBudget, type CollectionRunRow } from "@/lib/apify/budget";
import type { RunKind } from "@/lib/domain/run";
import { RUN_PROVIDER_OF_BACKEND, type LlmCallMeta } from "@/lib/llm/types";
import type { AdminClient } from "@/lib/supabase/admin";

export type SubscriptionProvider = "gemini" | "claude_cli";

export async function openSubscriptionRun(
  client: AdminClient,
  workspaceId: string,
  provider: SubscriptionProvider,
  kind: RunKind,
  targetLabel: string,
): Promise<CollectionRunRow> {
  return reserveBudget(workspaceId, provider, 0, { kind, billing: "subscription", targetLabel }, { client });
}

export interface RunClose {
  ok: boolean;
  error?: string;
  itemCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Çağrının modeli (Claude CLI zarfının bildirdiği ad; agy'de yapılandırılan ad). Verilmezse sütun NULL kalır (gölge maliyet varsayıma düşer). */
  model?: string;
}

export async function closeRun(client: AdminClient, runId: string, close: RunClose): Promise<void> {
  await markRunFinished(runId, { status: close.ok ? "succeeded" : "failed", error: close.error, itemCount: close.itemCount }, { client });
  const model = close.model?.trim() || undefined;
  const hasTokens = close.inputTokens !== undefined || close.outputTokens !== undefined;
  if (!hasTokens && model === undefined) return;
  const { error } = await client
    .from("collection_runs")
    .update({
      ...(hasTokens ? { input_tokens: close.inputTokens ?? null, output_tokens: close.outputTokens ?? null } : {}),
      ...(model === undefined ? {} : { model: model.slice(0, 120) }),
    })
    .eq("id", runId);
  if (error) throw new Error(`Koşu kaydı jeton sayısı / model yazılamadı: ${error.message}`);
}

/** Bitmiş bir LLM çağrısını (başarılı `meta`) tek satır olarak kaydeder; koşu kimliğini döndürür. */
export async function recordLlmRun(
  client: AdminClient,
  workspaceId: string,
  meta: LlmCallMeta,
  targetLabel: string,
  itemCount?: number,
): Promise<string> {
  const provider = RUN_PROVIDER_OF_BACKEND[meta.backend];
  if (provider !== "claude_cli") throw new Error("Yalnız abonelik (claude_cli) LLM çağrıları bu betikte kaydedilir.");
  const run = await openSubscriptionRun(client, workspaceId, provider, meta.kind, targetLabel);
  await closeRun(client, run.id, { ok: true, itemCount, inputTokens: meta.usage?.inputTokens, outputTokens: meta.usage?.outputTokens, model: meta.model });
  return run.id;
}

/** Başarısız LLM çağrısını kaydeder (hata ileti uzunluğu `markRunFinished`'te kırpılır). */
export async function recordFailedLlmRun(client: AdminClient, workspaceId: string, kind: RunKind, targetLabel: string, error: string): Promise<void> {
  const run = await openSubscriptionRun(client, workspaceId, "claude_cli", kind, targetLabel);
  await closeRun(client, run.id, { ok: false, error });
}
