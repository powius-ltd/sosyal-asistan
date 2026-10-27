/**
 * Halka olgularının DB okuyucusu (service role; her sorgu `workspace_id` süzgeçli, YALNIZ OKUR). Kural `derive.ts`'tedir; burada
 * yalnız sayılır ve en son anlar toplanır. `env`: Zernio anahtarı var mı (değer okunmaz, yalnız varlığı).
 * Ajan ayarları (`collect_every_days`, `collect_video_limit`, `rival_target`) YALNIZ ajan bağlamında olgulara girer (`applySettings`;
 * varsayılan `AGENT_AUTO` anahtarı): ajan kapalıyken `CYCLE_AUTO` zinciri eski kuralla (7 gün, en az 1 rakip) AYNEN sürer.
 */
import "server-only";

import { isAgentAuto } from "@/lib/agents/director/enabled";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import type { CycleFacts, CycleLastJob, PublishQueueFacts } from "@/lib/cycle/types";
import { toAccountType } from "@/lib/domain/account-type";
import type { JobKind, JobStatus } from "@/lib/domain/panel-job";
import { loadScreens, loadTranscripts } from "@/lib/intel/content-load";
import { countSelectable, type AnalysisCandidate } from "@/lib/intel/analysis-select";
import { loadLabelVersions } from "@/lib/intel/label-store";
import { countLabelable, type LabelCandidate } from "@/lib/intel/label-select";
import { hasAnyText } from "@/lib/llm/content-text";
import { PROMPT_VERSION as LABEL_PROMPT_VERSION } from "@/lib/llm/label-angles";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { unwrap } from "@/lib/data/supabase/errors";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import type { AdminClient } from "@/lib/supabase/admin";
import { DAY_MS } from "@/lib/time";
import { ordersRootOf } from "@/lib/publish/order-media";
import { handledOrderIds, isOrderPublishRow } from "@/lib/publish/order-rows";
import { listReturnableOrderIds } from "@/lib/publish/order-return";
import { listStudioPanelSlugs, studioAccountOf } from "@/lib/studio-order/accounts";
import { pickZernioKey } from "@/lib/zernio/api-key";

const addDays = (dayKey: string, days: number): string => new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const outcomeOf = (result: unknown): string | undefined => {
  const outcome = (result as { outcome?: unknown } | null)?.outcome;
  return typeof outcome === "string" ? outcome : undefined;
};
const latest = (values: readonly (string | null | undefined)[]): string | undefined => values.filter((v): v is string => typeof v === "string").sort().at(-1);

export type ReadCycleOptions = { applySettings?: boolean };

export async function readCycleFacts(
  client: AdminClient, workspaceId: string, now: Date, env: Readonly<Record<string, string | undefined>>, options: ReadCycleOptions = {},
): Promise<CycleFacts> {
  const applySettings = options.applySettings ?? isAgentAuto({ ...env });
  const today = toDayKey(now) ?? now.toISOString().slice(0, 10);
  const thisWeek = weekStartOf(today) ?? today;
  const nextWeekStart = addDays(thisWeek, 7);

  const workspace = unwrap(await client.from("workspaces").select("slug, account_type, collect_every_days, collect_video_limit, rival_target").eq("id", workspaceId).single());
  const [accounts, rivals, candidates, contents, analyses, plans, jobs, competitorTimes, measured, orderRows, screens, transcripts, labelVersions] = await Promise.all([
    client.from("social_accounts").select("id, handle, last_synced_at").eq("workspace_id", workspaceId),
    client.from("competitors").select("id, last_collected_at").eq("workspace_id", workspaceId).eq("status", "tracked"),
    client.from("competitors").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "candidate"),
    fetchAllRows((from, to) => client.from("content_items").select("id, social_account_id, competitor_id, caption").eq("workspace_id", workspaceId).order("id").range(from, to)),
    fetchAllRows((from, to) => client.from("content_analyses").select("id, content_item_id, status").eq("workspace_id", workspaceId).in("status", ["ok", "insufficient_data"]).order("id").range(from, to)),
    client.from("weekly_plans").select("week_start").eq("workspace_id", workspaceId).in("week_start", [thisWeek, nextWeekStart]),
    client.from("panel_jobs").select("kind, status, finished_at, result").eq("workspace_id", workspaceId).eq("dry_run", false).order("created_at", { ascending: false }).limit(CYCLE_RULES.jobHistoryLimit),
    client.from("competitors").select("last_collected_at").eq("workspace_id", workspaceId).not("last_collected_at", "is", null).order("last_collected_at", { ascending: false }).limit(1),
    client.from("metric_snapshots").select("captured_at, content_items!inner(social_account_id)").eq("workspace_id", workspaceId).not("content_items.social_account_id", "is", null).order("captured_at", { ascending: false }).limit(1),
    client.from("publish_jobs").select("order_id, status, scheduled_at, media_path, social_account_id, created_at").eq("workspace_id", workspaceId).not("order_id", "is", null),
    loadScreens(client, workspaceId),
    loadTranscripts(client, workspaceId, now),
    loadLabelVersions(client, workspaceId),
  ]);

  const accountRows = unwrap(accounts);
  const analyzedIds = new Set(analyses.map((row) => row.content_item_id));
  const analysisStatus = new Map(analyses.map((row) => [row.content_item_id, row.status as AnalysisCandidate["analysisStatus"]] as const));
  // `analyze` / `label` işlerinin seçim kuralıyla AYNI sayım: yalnız kendi + izlenen rakip, niş dışı rakip ve metinsiz içerik sayılmaz.
  const trackedIds = new Set(unwrap(rivals).map((row) => row.id));
  const scoped = contents.filter((row) => row.social_account_id !== null || (row.competitor_id !== null && trackedIds.has(row.competitor_id)));
  const analysisCandidates: AnalysisCandidate[] = scoped.map((row) => ({
    id: row.id, isOwn: row.social_account_id !== null, handle: "", inNiche: screens.get(row.id)?.inNiche, analysisStatus: analysisStatus.get(row.id),
  }));
  const labelCandidates: LabelCandidate[] = scoped.map((row) => ({
    id: row.id, isOwn: row.social_account_id !== null, analysisStatus: analysisStatus.get(row.id), inNiche: screens.get(row.id)?.inNiche,
    labelPromptVersion: labelVersions.get(row.id),
    hasText: hasAnyText({ caption: row.caption ?? undefined, transcript: transcripts.get(row.id)?.speech, screenText: transcripts.get(row.id)?.screen }),
  }));
  const planWeeks = new Set(unwrap(plans).map((row) => row.week_start));
  const jobRows: CycleLastJob[] = unwrap(jobs).map((row) => ({
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(outcomeOf(row.result) === undefined ? {} : { outcome: outcomeOf(row.result) as string }),
  }));
  const contentIds = contents.map((row) => row.id);
  const orders = unwrap(orderRows);
  // `publish` işinin okuduğu satırlarla AYNI süzgeç (tutamaklı kendi hesap + `siparis:` medya): yoksa zincir hiçbir satıra bakmayan işi tekrar açar.
  const handles = new Map(accountRows.map((row) => [row.id, row.handle] as const));
  const studioSlug = workspace.slug !== null && listStudioPanelSlugs().includes(workspace.slug) ? studioAccountOf(workspace.slug).studioSlug : undefined;
  const publishQueue: PublishQueueFacts = {
    returnable: studioSlug === undefined ? 0 : listReturnableOrderIds(ordersRootOf(env), studioSlug, handledOrderIds(orders)).length,
    awaitingApproval: orders.filter((row) => row.status === "awaiting_approval").length,
    dueForPublish: orders.filter((row) => isOrderPublishRow(row, handles) && (row.status === "approved" || (row.status === "ready" && row.scheduled_at !== null && Date.parse(row.scheduled_at) <= now.getTime()))).length,
    approved: orders.filter((row) => isOrderPublishRow(row, handles) && row.status === "approved").length,
  };

  return {
    workspaceId,
    accountType: toAccountType(workspace.account_type),
    ownAccounts: accountRows.length,
    trackedRivals: unwrap(rivals).length,
    pendingCandidates: candidates.count ?? 0,
    ...(applySettings
      ? { collectEveryDays: workspace.collect_every_days, collectVideoLimit: workspace.collect_video_limit, rivalTarget: workspace.rival_target }
      : {}),
    contentCount: contents.length,
    lastCollectedAt: latest([...accountRows.map((row) => row.last_synced_at), ...unwrap(rivals).map((row) => row.last_collected_at), ...unwrap(competitorTimes).map((row) => row.last_collected_at)]),
    pendingAnalysis: countSelectable(analysisCandidates),
    analyzedCount: contentIds.filter((id) => analyzedIds.has(id)).length,
    pendingLabels: countLabelable(labelCandidates, LABEL_PROMPT_VERSION),
    nextWeekPlan: planWeeks.has(nextWeekStart),
    thisWeekPlan: planWeeks.has(thisWeek),
    ownContentCount: contents.filter((row) => row.social_account_id !== null).length,
    lastMeasuredAt: unwrap(measured)[0]?.captured_at,
    publishQueue,
    zernioKey: pickZernioKey(workspace.slug ?? undefined, env) !== undefined,
    jobs: jobRows,
    nextWeekStart,
  };
}
