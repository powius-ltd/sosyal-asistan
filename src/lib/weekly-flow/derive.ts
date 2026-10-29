/**
 * Haftalık akışın 5 adımının durumu (SAF; saat girdidedir). Her adım kendi koşulunu bağımsız hesaplar; ilk bitmemiş adım `active`
 * (okunamadıysa `blocked`), ondan sonra bitmemiş olanlar `waiting`, koşulu zaten sağlananlar `done`.
 * İstisna (kullanıcı kararı 2026-10-27): bu haftanın planı hazırsa Seç / Fiş, Topla / İncele'yi BEKLEMEZ: ilk bitmemiş adım
 * önce Seç / Fiş'te aranır; o sırada bitmemiş Topla / İncele kendi durumunu söyleyerek `waiting` kalır (gelecek haftayı besler).
 * Değişmez: etkin + engelli adım sayısı, akış bitmediyse TAM 1; hepsi bitince 0.
 */
import { WEEKLY_FLOW_COPY as COPY } from "@/lib/copy/weekly-flow";
import { AGENT_SETTING_LIMITS } from "@/lib/domain/agent-settings";
import type { JobKind } from "@/lib/domain/panel-job";
import { ROUTES } from "@/lib/routes";
import { DAY_MS } from "@/lib/time";
import { WEEKLY_FLOW_STEP_KEYS, type WeeklyFlowAction, type WeeklyFlowInput, type WeeklyFlowStep, type WeeklyFlowStepKey } from "@/lib/weekly-flow/types";

/** Seçilmiş sayılan fikir durumları (yayınlanan da seçilmişti). */
const SELECTED_STATUSES = new Set(["saved", "scripted", "scheduled", "published"]);

const COLLECT_JOBS: readonly JobKind[] = ["collect", "routine", "onboarding"];
const ANALYZE_JOBS: readonly JobKind[] = ["analyze", "routine", "onboarding"];
const PLAN_JOBS: readonly JobKind[] = ["plan", "routine", "onboarding"];

const chat = (message: string): WeeklyFlowAction => ({ kind: "chat", message });

/** Adımın kendi sonucu. */
type Own =
  | { done: true; reason: string }
  | { done: false; blocked: true; reason: string }
  | { done: false; blocked?: false; reason: string; action?: WeeklyFlowAction; secondaryAction?: WeeklyFlowAction; waitingReason: string };

const hasJob = (input: WeeklyFlowInput, kinds: readonly JobKind[]) => input.activeJobKinds?.some((k) => kinds.includes(k)) === true;

function ownCollect(input: WeeklyFlowInput): Own {
  const last = input.lastCollectedAt;
  const R = COPY.reasons.collect;
  if (last === undefined) return { done: false, blocked: true, reason: R.unreadable };
  const running = hasJob(input, COLLECT_JOBS);
  if (last !== null) {
    const lastMs = Date.parse(last);
    const everyDays = input.collectEveryDays ?? AGENT_SETTING_LIMITS.collectEveryDays.default;
    if (!Number.isNaN(lastMs) && input.now.getTime() - lastMs <= everyDays * DAY_MS) return { done: true, reason: R.done };
  }
  const reason = running ? R.running : last === null ? R.never : R.stale;
  return { done: false, reason, waitingReason: reason, ...(running ? {} : { action: chat(COPY.chat.collect) }) };
}

function ownAnalyze(input: WeeklyFlowInput): Own {
  const R = COPY.reasons.analyze;
  const pending = input.pendingAnalysis;
  if (hasJob(input, ANALYZE_JOBS)) return { done: false, reason: R.running, waitingReason: R.waiting };
  if (pending === undefined) return { done: false, blocked: true, reason: R.unreadable };
  if (pending === 0) return { done: true, reason: R.done };
  return { done: false, reason: R.pending(pending), action: chat(COPY.chat.analyze), waitingReason: R.waiting };
}

function ownPlan(input: WeeklyFlowInput): Own {
  const R = COPY.reasons.plan;
  if (input.plan === undefined) return { done: false, blocked: true, reason: R.unreadable };
  if (input.plan !== null && input.plan.weekStart === input.currentWeekStart) return { done: true, reason: R.done };
  if (hasJob(input, PLAN_JOBS)) return { done: false, reason: R.running, waitingReason: R.waiting };
  return { done: false, reason: R.missing, action: chat(COPY.chat.plan), waitingReason: R.waiting };
}

const hasCurrentPlan = (input: WeeklyFlowInput): boolean => !!input.plan && input.plan.weekStart === input.currentWeekStart;

function selectedIdeas(input: WeeklyFlowInput): string[] {
  if (!hasCurrentPlan(input)) return [];
  return input.plan!.ideas.filter((idea) => SELECTED_STATUSES.has(idea.status)).map((idea) => idea.id);
}

function ownSelect(input: WeeklyFlowInput): Own {
  const R = COPY.reasons.select;
  const count = selectedIdeas(input).length;
  if (hasCurrentPlan(input) && input.plan!.approved === true) return { done: true, reason: R.approved };
  if (count > 0) return { done: true, reason: R.done(count) };
  return { done: false, reason: R.missing, action: chat(COPY.chat.select), secondaryAction: { kind: "link", href: ROUTES.thisWeek }, waitingReason: hasCurrentPlan(input) ? R.missing : R.waiting };
}

function ownTicket(input: WeeklyFlowInput): Own {
  const R = COPY.reasons.ticket;
  const selected = selectedIdeas(input);
  if (selected.length === 0) return { done: false, reason: R.waiting, waitingReason: R.waiting };
  if (input.ticketIdeaIds === undefined) return { done: false, blocked: true, reason: R.unreadable };
  const have = new Set(input.ticketIdeaIds);
  const missing = selected.filter((id) => !have.has(id)).length;
  if (missing === 0) return { done: true, reason: R.done };
  return { done: false, reason: R.missing(missing), action: chat(COPY.chat.ticket), waitingReason: R.missing(missing) };
}

const OWNS: Record<WeeklyFlowStepKey, (input: WeeklyFlowInput) => Own> = {
  collect: ownCollect,
  analyze: ownAnalyze,
  plan: ownPlan,
  select: ownSelect,
  ticket: ownTicket,
};

/** Plan hazırken öne geçen adımlar (sıralı). */
const PLAN_READY_STEPS: readonly WeeklyFlowStepKey[] = ["select", "ticket"];

export function deriveWeeklyFlow(input: WeeklyFlowInput): WeeklyFlowStep[] {
  const owns = WEEKLY_FLOW_STEP_KEYS.map((key) => ({ key, own: OWNS[key](input) }));
  const planFront = hasCurrentPlan(input) ? owns.find((o) => PLAN_READY_STEPS.includes(o.key) && !o.own.done) : undefined;
  const frontKey = (planFront ?? owns.find((o) => !o.own.done))?.key;
  return owns.map(({ key, own }): WeeklyFlowStep => {
    if (own.done) return { key, state: "done", reason: own.reason };
    if (key !== frontKey) {
      // Öne geçen adımdan önce kalan adım beklemiyor, kendi işini sürdürüyor: kendi sebebini söyler.
      const before = WEEKLY_FLOW_STEP_KEYS.indexOf(key) < WEEKLY_FLOW_STEP_KEYS.indexOf(frontKey!);
      return { key, state: "waiting", reason: own.blocked || before ? own.reason : own.waitingReason };
    }
    if (own.blocked) return { key, state: "blocked", reason: own.reason };
    return {
      key,
      state: "active",
      reason: own.reason,
      ...(own.action ? { action: own.action } : {}),
      ...(own.secondaryAction ? { secondaryAction: own.secondaryAction } : {}),
    };
  });
}
