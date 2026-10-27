/**
 * Yönetici ajanın olgu paketi (saf): halka durumu + son işler + bütçe + ayarlar. Kod hesaplar, model yalnız seçer. Tutar yalnız
 * KALAN HAK olarak ve "sığar mı" bilgisiyle verilir; model tutar yazmaz. Üçüncü kişi verisi (başlık, kullanıcı adı) pakette YOKTUR.
 */
import type { AgentBudget } from "@/lib/agents/director/budget";
import type { GuardContext } from "@/lib/agents/director/guard";
import type { CycleLastJob, CycleState } from "@/lib/cycle/types";
import type { AgentSettings } from "@/lib/domain/agent-settings";

export type DirectorTrigger = "job_finished" | "chat" | "cli";

export interface DirectorContext {
  trigger: DirectorTrigger;
  /** Sohbet / komut satırı emri (güvenilmez veri). */
  instruction?: string;
  state: CycleState;
  jobs: readonly CycleLastJob[];
  settings: AgentSettings;
  budget: AgentBudget;
  pendingCandidates: number;
  guard: GuardContext;
}

const affordable = (ctx: DirectorContext, kind: "collect" | "discover"): boolean => {
  const estimate = ctx.guard.estimates[kind];
  return ctx.budget.approved && estimate !== undefined && estimate <= ctx.budget.remainingUsd;
};

export function buildDirectorFacts(ctx: DirectorContext): Record<string, unknown> {
  return {
    trigger: ctx.trigger,
    accountType: ctx.state.accountType,
    nextStep: ctx.state.next ?? null,
    steps: ctx.state.steps.map((step) => ({ id: step.id, status: step.status, reason: step.reason, jobKind: step.jobKind ?? null })),
    recentJobs: ctx.jobs.slice(0, 8).map((job) => ({ kind: job.kind, status: job.status, outcome: job.outcome ?? null })),
    activeJob: ctx.guard.activeJob,
    paid: {
      capApproved: ctx.budget.approved,
      collect: { allowedNow: affordable(ctx, "collect"), everyDays: ctx.settings.collectEveryDays },
      discover: { allowedNow: affordable(ctx, "discover") },
      rivalTarget: ctx.settings.rivalTarget,
      pendingCandidates: ctx.pendingCandidates,
    },
  };
}
