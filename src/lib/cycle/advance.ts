/**
 * Halkayı bir adım ilerletir: durumu okur (`readCycleFacts` + `deriveCycle`), `nextCycleStep` kararını uygular. İşçi kancası (iş bitince)
 * ve `npm run halka -- ilerlet` aynı işlevi çağırır. Para kapısı `next.ts`'tedir (burada ikinci kez denetlenir: açılacak tür $0 olmalı).
 * İstek, verilen KUYRUĞA yazılır (işçi biten işin kuyruğunu verir; testler kendi kuyruğunda kalır). Tek etkin iş kuralı DB'dedir
 * (`already_exists` = başka iş sürüyor, bekle). `dryRun`: hiçbir şey yazılmaz (iş de bildirim de), karar döner.
 */
import "server-only";

import { CHAIN_JOB_KINDS, isChainSafeKind } from "@/lib/cycle/chain";
import { nextCycleStep, type ChainDecision, type ChainRequest, type ChainStop } from "@/lib/cycle/next";
import { cycleStopDraft, insertCycleNotice } from "@/lib/cycle/notify";
import { gateByCredits, istanbulDayStart, slipAllowedFor } from "@/lib/cycle/gates";
import { listStudioPanelSlugs } from "@/lib/studio-order/accounts";
import { noProgressKinds } from "@/lib/cycle/no-progress";
import { deriveCycle } from "@/lib/cycle/derive";
import { readCycleFacts } from "@/lib/cycle/read";
import { isCreditsEnforced } from "@/lib/credits/enforcement";
import { RepositoryError } from "@/lib/data/repository";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import type { RequestJobInput } from "@/lib/data/queries";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { unwrap } from "@/lib/data/supabase/errors";
import type { AdminClient } from "@/lib/supabase/admin";

export interface AdvanceParams {
  client: AdminClient;
  workspaceId: string;
  /** İşin yazılacağı kuyruk (biten işin kuyruğu; canlı işçide `panel`). */
  queue: string;
  now: Date;
  env: Readonly<Record<string, string | undefined>>;
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Testler için: iş onaylayanı. Verilmezse `LOCAL_USER_ID`. */
  approverUserId?: string;
}

export type AdvanceResult =
  | { action: "requested"; request: ChainRequest; jobId: string }
  | { action: "would_request"; request: ChainRequest }
  | { action: "waiting"; request: ChainRequest }
  | { action: "stopped"; stop: ChainStop; notified: boolean };


/** Bugün (İstanbul günü) bu çalışma alanında açılan zincir türü iş sayısı (kuru koşu hariç). */
async function chainJobsToday(client: AdminClient, workspaceId: string, now: Date): Promise<number> {
  const rows = unwrap(
    await client.from("panel_jobs").select("id").eq("workspace_id", workspaceId).eq("dry_run", false).in("kind", [...CHAIN_JOB_KINDS]).eq("params->>source", "cycle").gte("created_at", istanbulDayStart(now)),
  );
  return rows.length;
}

/** Gelecek haftanın planında `brief_slot`lu öğe var ve plandan sonra bitmiş / süren bir fiş işi yoksa haftanın Pazartesi'si. */
async function pendingSlipWeek(client: AdminClient, workspaceId: string, weekStart: string, jobs: readonly { kind: string; status: string; finishedAt?: string }[]): Promise<string | undefined> {
  const plan = unwrap(await client.from("weekly_plans").select("id, generated_at").eq("workspace_id", workspaceId).eq("week_start", weekStart).maybeSingle());
  if (plan === null) return undefined;
  const slots = unwrap(await client.from("weekly_plan_items").select("id").eq("workspace_id", workspaceId).eq("plan_id", plan.id).not("brief_slot", "is", null).limit(1));
  if (slots.length === 0) return undefined;
  const written = jobs.some((job) => job.kind === "order" && (job.status === "queued" || job.status === "running" || ((job.status === "succeeded" || job.status === "partial") && (job.finishedAt ?? "") >= plan.generated_at)));
  return written ? undefined : weekStart;
}

export async function decideCycle(params: AdvanceParams): Promise<ChainDecision> {
  const facts = await readCycleFacts(params.client, params.workspaceId, params.now, params.env);
  const state = deriveCycle(facts, params.now);
  const skipKinds = noProgressKinds(facts.jobs, facts.publishQueue, params.now);
  const slug = unwrap(await params.client.from("workspaces").select("slug").eq("id", params.workspaceId).single()).slug;
  const slipWeek = slipAllowedFor(slug, listStudioPanelSlugs()) && (state.next === undefined || skipKinds.size > 0)
    ? await pendingSlipWeek(params.client, params.workspaceId, facts.nextWeekStart, facts.jobs)
    : undefined;
  const decision = nextCycleStep(state, { jobs: facts.jobs, chainJobsToday: await chainJobsToday(params.client, params.workspaceId, params.now), skipKinds, ...(slipWeek === undefined ? {} : { slipWeek }) });
  return gateByCredits(decision, isCreditsEnforced(params.env), (kind) => state.steps.find((step) => step.jobKind === kind)?.id);
}

const toInput = (request: ChainRequest): RequestJobInput =>
  request.kind === "order" ? { kind: "order", week: request.week ?? "", source: "cycle" } : ({ kind: request.kind, source: "cycle" } as RequestJobInput);

export async function advanceCycle(params: AdvanceParams): Promise<AdvanceResult> {
  const log = params.log ?? (() => undefined);
  const decision = await decideCycle(params);
  if ("stop" in decision) {
    const today = toDayKey(params.now) ?? params.now.toISOString().slice(0, 10);
    const draft = cycleStopDraft(decision.stop, weekStartOf(today) ?? today);
    let notified = false;
    if (draft !== undefined && params.dryRun !== true) notified = await insertCycleNotice(params.client, params.workspaceId, draft);
    log(`Halka durdu (${decision.stop.reason}${decision.stop.step === undefined ? "" : `: ${decision.stop.step}`})${draft === undefined ? "" : notified ? "; bildirim yazıldı" : params.dryRun === true ? "; bildirim yazılacaktı" : "; bildirim zaten vardı"}.`);
    return { action: "stopped", stop: decision.stop, notified };
  }
  const { request } = decision;
  // İkinci kapı: karar katmanı yanılsa bile para harcayan tür burada kesin reddedilir.
  if (!isChainSafeKind(request.kind)) throw new Error(`Halka "${request.kind}" işini açamaz (para harcayan ya da zincir dışı tür).`);
  if (params.dryRun === true) {
    log(`Halka açacaktı: ${request.kind}${request.week === undefined ? "" : ` (${request.week})`} (kuru koşu: yazılmadı).`);
    return { action: "would_request", request };
  }
  const approverUserId = params.approverUserId ?? readLocalSupabaseEnv(params.env).userId;
  const repo = createSupabaseRepository({ db: params.client, approverUserId, jobQueue: params.queue, creditsEnforced: isCreditsEnforced(params.env) });
  try {
    const job = await repo.requestJob(params.workspaceId, toInput(request));
    log(`Halka iş açtı: ${request.kind} (${job.id.slice(0, 8)}).`);
    return { action: "requested", request, jobId: job.id };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "already_exists") {
      log(`Halka bekliyor: çalışma alanında etkin iş var (${request.kind} açılmadı).`);
      return { action: "waiting", request };
    }
    throw error;
  }
}
