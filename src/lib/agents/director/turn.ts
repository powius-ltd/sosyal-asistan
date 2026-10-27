/**
 * Ajan turu (gövde): olguları okur → zincirin yedek kararını hesaplar → beyin (`decide.ts`) önerir, kapı (`guard.ts`) denetler → karar
 * UYGULANIR (iş açılır ya da zile not yazılır). Tetik: iş bitişi (`hook.ts`), sohbet emri, komut satırı. Çalışma alanı başına tek tur
 * (süreç içi kilit). Hata FIRLATILMAZ içeri: tur sonucu döner. `dryRun`: model çağrılır ama iş, bildirim ve koşu kaydı YAZILMAZ.
 *
 * Para: ücretli iş (`collect`, `discover`) YALNIZ `monthly_cap` dayanağı + `source: "agent"` ile istenir; ikinci/üçüncü kapı depo girdisi
 * (`assertJobApprovalAllowed`), DB trigger'ı ve işçide `agentCeiling`'dir. Burada tutar belirlenmez, tavan değişmez, onay verilmez.
 */
import "server-only";

import { loadAgentBudget, estimateAgentStepUsd } from "@/lib/agents/director/budget";
import { decideDirector, type DirectorDecision } from "@/lib/agents/director/decide";
import type { DirectorContext, DirectorTrigger } from "@/lib/agents/director/facts";
import type { GuardContext } from "@/lib/agents/director/guard";
import { writeAgentNotice } from "@/lib/agents/director/notify";
import { createChatLock } from "@/lib/agents/chat/lock";
import { CHAIN_JOB_KINDS } from "@/lib/cycle/chain";
import { deriveCycle } from "@/lib/cycle/derive";
import { istanbulDayStart } from "@/lib/cycle/gates";
import { decideCycle } from "@/lib/cycle/advance";
import { readCycleFacts } from "@/lib/cycle/read";
import { isCreditsEnforced } from "@/lib/credits/enforcement";
import { RepositoryError } from "@/lib/data/repository";
import type { RequestJobInput } from "@/lib/data/queries";
import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import { unwrap } from "@/lib/data/supabase/errors";
import { createSupabaseRepository } from "@/lib/data/supabase/supabase-repository";
import { agentSettingsOf } from "@/lib/domain/agent-settings";
import { AGENT_CAP_KINDS, JOB_QUEUE_DEFAULT, type JobKind } from "@/lib/domain/panel-job";
import { toDayKey } from "@/lib/format";
import { recordLlmRun } from "@/lib/intel/run-log";
import { createLlmBackend } from "@/lib/llm/backend";
import type { LlmBackend } from "@/lib/llm/types";
import type { AdminClient } from "@/lib/supabase/admin";

const directorLock = createChatLock();

export interface DirectorTurnParams {
  client: AdminClient;
  workspaceId: string;
  /** İşin yazılacağı kuyruk (biten işin kuyruğu; elle koşuda `panel`). */
  queue?: string;
  now: Date;
  env: Readonly<Record<string, string | undefined>>;
  trigger: DirectorTrigger;
  /** Sohbet / komut satırı emri (güvenilmez veri). */
  instruction?: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Testler için. */
  llm?: LlmBackend;
  approverUserId?: string;
}

export type DirectorOutcome = "requested" | "waiting" | "refused" | "notified" | "idle" | "busy";

export interface DirectorTurnResult {
  outcome: DirectorOutcome;
  decision?: DirectorDecision;
  jobId?: string;
  /** Zile yeni bildirim yazıldı mı. */
  notified?: boolean;
}

const PAID_KINDS: readonly string[] = AGENT_CAP_KINDS;

async function agentJobsToday(client: AdminClient, workspaceId: string, now: Date): Promise<number> {
  const rows = unwrap(
    await client.from("panel_jobs").select("id").eq("workspace_id", workspaceId).eq("dry_run", false).in("kind", [...CHAIN_JOB_KINDS, ...AGENT_CAP_KINDS]).in("params->>source", ["cycle", "agent"]).gte("created_at", istanbulDayStart(now)),
  );
  return rows.length;
}

/** Son ücretli işlerin açılış anı (iptal edilen sayılmaz: hiç koşmadı). */
async function lastPaidAt(client: AdminClient, workspaceId: string): Promise<GuardContext["lastPaidAt"]> {
  const rows = unwrap(
    await client.from("panel_jobs").select("kind, created_at").eq("workspace_id", workspaceId).eq("dry_run", false).in("kind", [...AGENT_CAP_KINDS]).neq("status", "cancelled").order("created_at", { ascending: false }).limit(20),
  );
  const out: GuardContext["lastPaidAt"] = {};
  for (const row of rows) {
    const kind = row.kind as "collect" | "discover";
    if (out[kind] === undefined) out[kind] = row.created_at;
  }
  return out;
}

export async function buildDirectorContext(params: DirectorTurnParams): Promise<{ ctx: DirectorContext; chain: Awaited<ReturnType<typeof decideCycle>> }> {
  const { client, workspaceId, now } = params;
  const facts = await readCycleFacts(client, workspaceId, now, params.env, { applySettings: true });
  const state = deriveCycle(facts, now);
  const settings = agentSettingsOf(facts);
  const budget = await loadAgentBudget(client, workspaceId, now);
  const collectInput = { accounts: facts.ownAccounts + facts.trackedRivals, videosPerAccount: settings.collectVideoLimit };
  const estimates: GuardContext["estimates"] = {};
  for (const kind of ["collect", "discover"] as const) {
    const estimate = estimateAgentStepUsd(kind, collectInput);
    if (estimate !== undefined) estimates[kind] = estimate;
  }
  const guard: GuardContext = {
    now,
    budget,
    estimates,
    activeJob: facts.jobs.some((job) => job.status === "queued" || job.status === "running"),
    jobsToday: await agentJobsToday(client, workspaceId, now),
    lastPaidAt: await lastPaidAt(client, workspaceId),
    collectEveryDays: settings.collectEveryDays,
  };
  const ctx: DirectorContext = { trigger: params.trigger, ...(params.instruction === undefined ? {} : { instruction: params.instruction }), state, jobs: facts.jobs, settings, budget, pendingCandidates: facts.pendingCandidates ?? 0, guard };
  const chain = await decideCycle({ client, workspaceId, queue: params.queue ?? JOB_QUEUE_DEFAULT, now, env: params.env });
  return { ctx, chain };
}

/** Kararın iş isteği: ücretli türler yalnız ajan tavanı dayanağıyla, $0 türler halka işaretiyle (günlük sınıra sayılır). */
export function requestOf(decision: DirectorDecision, collectVideoLimit: number): RequestJobInput | undefined {
  const kind: JobKind | undefined = decision.kind;
  if (decision.action !== "open_job" || kind === undefined) return undefined;
  if (kind === "collect") return { kind, limit: collectVideoLimit, approval: { basis: "monthly_cap" }, source: "agent" };
  if (kind === "discover") return { kind, approval: { basis: "monthly_cap" }, source: "agent" };
  if (kind === "order") return decision.week === undefined ? undefined : { kind, week: decision.week, source: "cycle" };
  if (PAID_KINDS.includes(kind)) return undefined;
  return { kind, source: "cycle" } as RequestJobInput;
}

export async function runDirectorTurn(params: DirectorTurnParams): Promise<DirectorTurnResult> {
  const log = params.log ?? (() => undefined);
  const release = directorLock.acquire(params.workspaceId);
  if (release === undefined) {
    log("Ajan turu atlandı: bu çalışma alanında tur sürüyor.");
    return { outcome: "busy" };
  }
  try {
    const { ctx, chain } = await buildDirectorContext(params);
    const decision = await decideDirector(ctx, chain, { llm: params.llm ?? createLlmBackend({ env: params.env }), log });
    const dayKey = toDayKey(params.now) ?? params.now.toISOString().slice(0, 10);
    if (decision.meta !== undefined && params.dryRun !== true) {
      await recordLlmRun(params.client, params.workspaceId, decision.meta, "yönetici ajan").catch((error: unknown) => log(`Uyarı: ajan koşu kaydı yazılamadı (${error instanceof Error ? error.message : "hata"}).`));
    }
    log(`Ajan kararı: ${decision.action}${decision.kind === undefined ? "" : ` ${decision.kind}`} (${decision.source === "llm" ? "model" : "yedek"}).`);

    if (decision.action === "open_job") {
      const request = requestOf(decision, ctx.settings.collectVideoLimit);
      if (request === undefined) return { outcome: "idle", decision };
      if (params.dryRun === true) {
        log(`Ajan iş açacaktı: ${request.kind} (kuru koşu: yazılmadı).`);
        return { outcome: "waiting", decision };
      }
      const approverUserId = params.approverUserId ?? readLocalSupabaseEnv(params.env).userId;
      const repo = createSupabaseRepository({ db: params.client, approverUserId, jobQueue: params.queue ?? JOB_QUEUE_DEFAULT, creditsEnforced: isCreditsEnforced(params.env) });
      try {
        const job = await repo.requestJob(params.workspaceId, request);
        log(`Ajan iş açtı: ${request.kind} (${job.id.slice(0, 8)}).`);
        return { outcome: "requested", decision, jobId: job.id };
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "already_exists") return { outcome: "waiting", decision };
        if (error instanceof RepositoryError && (error.code === "invalid_input" || error.code === "invalid_state" || error.code === "insufficient_credits")) {
          log(`Ajanın isteği reddedildi (${error.code}): ${error.message}`);
          return { outcome: "refused", decision };
        }
        throw error;
      }
    }
    if (decision.action === "ask_approval" || decision.action === "notify") {
      // Sohbet emrinde yanıt sohbetten döner; zil yalnız kendi başına (iş bitişi / komut satırı) çalışan turun çıktısıdır.
      if (params.trigger === "chat" || params.dryRun === true) return { outcome: "notified", decision, notified: false };
      const notified = await writeAgentNotice(params.client, params.workspaceId, decision.action, ctx.state.next ?? "genel", dayKey, decision.message);
      return { outcome: "notified", decision, notified };
    }
    return { outcome: "idle", decision };
  } finally {
    release();
  }
}
