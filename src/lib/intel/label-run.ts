/**
 * `label:angles` orkestrasyonu (Kreatif Matris): analizi `ok` olan kendi + izlenen rakip içerikleri açı × farkındalık katmanına etiketler.
 * Sıra: (koşu başı bakım) → içerik/analiz/eleme/transcript/etiket oku → seç (`label-select`, kod) → 8'lik partiler (Claude, hafif model)
 * → her başarılı parti ayrı bir abonelik `collection_runs` satırı + `content_creative_labels` upsert (parti parti: yarıda kesilirse
 * biten partiler kalır). Süresi dolan transcript okunmaz (`loadTranscripts`). Karar verilemeyen (`unsure`) içerik için satır yazılmaz.
 * Kanıtı doğrulanamayan etiket `evidence_verified = false` ile yazılır (matrise girmez). Parti hatasında diğer partiler korunur; kalıcı
 * hatada (CLI yok/oturum yok) kalan partiler denenmez. `--dry-run`: yalnız seçim (LLM yok, yazma yok, bakım yok).
 */
import "server-only";

import { classifyCta } from "@/lib/data/views/insights-cta";
import { chunk } from "@/lib/data/supabase/paging";
import type { ContentItem } from "@/lib/domain/content";
import { lightModel, type IntelContext } from "@/lib/intel/context";
import { loadAllContent, loadAnalyses, loadScreens, loadTranscripts, type AnalysisBrief, type TranscriptTexts } from "@/lib/intel/content-load";
import { runHousekeeping } from "@/lib/intel/housekeeping";
import type { LabelArgs } from "@/lib/intel/label-args";
import { labelingSkipReason, selectForLabeling, toLabelCandidate, type LabelSelectionCounts } from "@/lib/intel/label-select";
import { loadLabelVersions, saveLabels } from "@/lib/intel/label-store";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import { createLlmBackend } from "@/lib/llm/backend";
import { LABEL_ANGLES_KIND, LABEL_BATCH_MAX, labelAngles, PROMPT_VERSION, type LabelAnglesItem } from "@/lib/llm/label-angles";
import { LlmError } from "@/lib/llm/types";

export type LabelOutcome = "completed" | "dry_run" | "nothing_to_do" | "skipped_account_type";

export interface LabelSummary {
  outcome: LabelOutcome;
  counts: LabelSelectionCounts;
  /** Bu koşuda etiketlenmek üzere seçilen (limit sonrası). */
  selected: number;
  /** Yazılan etiket sayısı (doğrulanmış + doğrulanmamış). */
  labeled: number;
  verified: number;
  /** Alıntısı doğrulanamadığı için `evidence_verified = false` yazılan (matrise girmez). */
  unverified: number;
  /** Modelin karar veremediği (satır yazılmadı). */
  unsure: number;
  /** Metinsiz (modele gitmedi). */
  unlabelable: number;
  /** Parti hatası yüzünden etiketlenemeyen ya da kalıcı hatayla denenmeyen içerik. */
  failed: number;
  /** Başarılı model çağrısı (partisi) sayısı. */
  batches: number;
  seconds: number;
  /** `skipped_account_type` ise atlama nedeni (Türkçe); aksi halde undefined. */
  skipReason?: string;
}

/** Bir kez olunca sonraki partilerde de olacak hatalar (CLI yok/oturum yok/limit dolu): kalan partiler denenmez. */
const PERSISTENT_ERRORS: readonly string[] = ["spawn_failed", "cli_failed"];
/** Çağıranın hatası: partiye çevrilmez, olduğu gibi fırlar. */
const CALLER_ERRORS: readonly string[] = ["invalid_input", "invalid_config", "not_implemented"];

const emptyCounts = (): LabelSelectionCounts => ({ considered: 0, eligible: 0, alreadyLabeled: 0, offNiche: 0, notAnalyzed: 0, noText: 0, staleVersion: 0 });

const emptySummary = (): LabelSummary => ({
  outcome: "completed",
  counts: emptyCounts(),
  selected: 0,
  labeled: 0,
  verified: 0,
  unverified: 0,
  unsure: 0,
  unlabelable: 0,
  failed: 0,
  batches: 0,
  seconds: 0,
});

const describeItem = (item: ContentItem) => `@${item.owner.handle} ${item.shortcode ?? item.externalId}`;

/** Modelin göreceği ve alıntı denetiminin korpusu: konuşma + ekran yazısı (süresi dolmamış transcript) + açıklama; hook yalnız `ok` analizden. */
function toLabelItem(item: ContentItem, transcript: TranscriptTexts | undefined, analysis: AnalysisBrief | undefined): LabelAnglesItem {
  return {
    id: item.id,
    caption: item.caption,
    transcript: transcript?.speech,
    screenText: transcript?.screen,
    hookText: analysis?.status === "ok" ? analysis.hookText : undefined,
    ctaType: classifyCta(item.caption),
  };
}

export async function runLabeling(ctx: IntelContext, args: LabelArgs, log: (line: string) => void): Promise<LabelSummary> {
  const t0 = performance.now();
  const summary = emptySummary();
  const finish = (outcome: LabelOutcome): LabelSummary => ({ ...summary, outcome, seconds: Math.round((performance.now() - t0) / 100) / 10 });

  // Açı etiketlemesi uygulanmayan hesap türü (içerik üreticisi): hiçbir okuma/bakım/model çağrısı yok, neden yazılır.
  const skipReason = labelingSkipReason(ctx.workspace.accountType);
  if (skipReason !== undefined) {
    log(skipReason);
    summary.skipReason = skipReason;
    return finish("skipped_account_type");
  }

  if (!args.dryRun) await runHousekeeping(ctx, log); // transcript 90 gün saklama + kapanmamış eski abonelik koşuları
  const tracked = new Set((await ctx.repo.listCompetitors(ctx.workspaceId, { status: "tracked" })).map((c) => c.id));
  const all = await loadAllContent(ctx.repo, ctx.workspaceId, { format: "short_video" });
  const items = all.filter((item) => item.owner.kind === "own" || tracked.has(item.owner.id));
  const [analyses, screens, transcripts, versions] = await Promise.all([
    loadAnalyses(ctx.client, ctx.workspaceId),
    loadScreens(ctx.client, ctx.workspaceId),
    loadTranscripts(ctx.client, ctx.workspaceId, ctx.now),
    loadLabelVersions(ctx.client, ctx.workspaceId),
  ]);

  const candidates = items.map((item) =>
    toLabelCandidate(item, { transcript: transcripts.get(item.id), inNiche: screens.get(item.id)?.inNiche, labelPromptVersion: versions.get(item.id) }),
  );
  const selection = selectForLabeling(candidates, { promptVersion: PROMPT_VERSION, limit: args.limit });
  summary.counts = selection.counts;
  summary.selected = selection.selected.length;

  const { counts } = selection;
  log(`İçerik: ${items.length} kısa video (${items.filter((i) => i.owner.kind === "own").length} kendi).`);
  log(
    `Seçim: ${counts.eligible} etiketlenecek${args.limit !== undefined ? ` (--limit ile ${summary.selected})` : ""} · zaten etiketli ${counts.alreadyLabeled} · analizi ok değil ${counts.notAnalyzed} · niş dışı ${counts.offNiche} · metinsiz ${counts.noText}${counts.staleVersion > 0 ? ` · eski sürümden yeniden ${counts.staleVersion}` : ""}.`,
  );

  const byId = new Map(items.map((item) => [item.id, item]));
  if (args.dryRun) {
    for (const c of selection.selected) {
      const item = byId.get(c.id) as ContentItem;
      log(`  - ${c.isOwn ? "kendi" : "rakip"} ${describeItem(item)} lift ${c.lift?.toFixed(2) ?? "—"}`);
    }
    return finish("dry_run");
  }
  if (selection.selected.length === 0) return finish("nothing_to_do");

  const llm = createLlmBackend();
  const model = lightModel();
  const batches = chunk(selection.selected, LABEL_BATCH_MAX);
  for (const [index, batch] of batches.entries()) {
    const position = `${index + 1}/${batches.length}`;
    const targetLabel = `açı etiketi (${batch.length} içerik)`;
    const inputs = batch.map((c) => toLabelItem(byId.get(c.id) as ContentItem, transcripts.get(c.id), analyses.get(c.id)));
    try {
      const outcome = await labelAngles(llm, inputs, { model });
      const runId = outcome.meta ? await recordLlmRun(ctx.client, ctx.workspaceId, outcome.meta, targetLabel, batch.length) : undefined;
      await saveLabels(ctx.client, outcome.labels, { workspaceId: ctx.workspaceId, promptVersion: outcome.promptVersion, model: outcome.meta?.model, runId, now: ctx.now });

      const verified = outcome.labels.filter((label) => label.evidenceVerified).length;
      summary.batches += outcome.meta ? 1 : 0;
      summary.labeled += outcome.labels.length;
      summary.verified += verified;
      summary.unverified += outcome.labels.length - verified;
      summary.unsure += outcome.unsure.length;
      summary.unlabelable += outcome.unlabelable.length;
      log(
        `[${position}] ${outcome.labels.length} etiket (${verified} kanıtı doğrulandı), ${outcome.unsure.length} belirsiz` +
          `${outcome.meta ? ` · ${Math.round(outcome.meta.durationMs / 1000)} sn, ${outcome.meta.attempts} deneme` : ""}`,
      );
    } catch (error) {
      if (!(error instanceof LlmError) || CALLER_ERRORS.includes(error.code)) throw error;
      const persistent = PERSISTENT_ERRORS.includes(error.code);
      const remaining = persistent ? batches.slice(index).flat().length : batch.length;
      summary.failed += remaining;
      log(`[${position}] parti başarısız (${error.code}): ${error.message.slice(0, 160)}${persistent ? ` — kalan ${remaining} içerik denenmedi` : ""}`);
      await recordFailedLlmRun(ctx.client, ctx.workspaceId, LABEL_ANGLES_KIND, targetLabel, error.message);
      if (persistent) break;
    }
  }
  return finish("completed");
}
