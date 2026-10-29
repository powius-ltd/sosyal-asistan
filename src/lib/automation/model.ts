/**
 * "Otomatik" ekranının modeli (SAF; depo yok): 4 satırın açık/kapalı durumu, son çalışması ve sıradaki zamanı. Son çalışma `panel_jobs`
 * satırlarından (kuru koşular sayılmaz), sıradaki zaman günlük tur ritminden türer. Ölçülemeyen = `undefined` (uydurma "0" ya da tarih yok).
 */
import { AUTOMATION_COPY as COPY } from "@/lib/copy/automation";
import { automationFlagsOf, type AutomationKey } from "@/lib/automation/flags";
import { agentSettingsOf } from "@/lib/domain/agent-settings";
import type { JobKind, PanelJob } from "@/lib/domain/panel-job";
import type { Workspace } from "@/lib/domain/run";
import { DAY_MS } from "@/lib/time";
import { formatDateTime, toDayKey } from "@/lib/format";
import { jobOutcomePhrase } from "@/lib/plain-language";

export const AUTOMATION_IDS = ["weekly_plan", "daily_measure", "produce", "share"] as const;
export type AutomationId = (typeof AUTOMATION_IDS)[number];

/** Satırı hangi iş türleri "son çalışma" yapar (yeniden eskiye ilk eşleşen). */
const ROW_JOB_KINDS: Record<AutomationId, readonly JobKind[]> = {
  weekly_plan: ["routine", "plan", "collect"],
  daily_measure: ["measure_zernio"],
  produce: ["produce"],
  share: ["publish"],
};

/** toggle: ayarla açılıp kapanır · always: hep açık (yalnız gösterilir) · soon: henüz yok. */
export type AutomationMode = "toggle" | "always" | "soon";

export interface AutomationLast {
  state: "never" | "queued" | "running" | "done";
  /** Bitiş anı (ISO); yalnız `done`. */
  at?: string;
  /** Ekranda görünen tek cümle. */
  text: string;
}

export interface AutomationRow {
  id: AutomationId;
  name: string;
  does: string;
  money: string;
  mode: AutomationMode;
  enabled: boolean;
  /** Anahtar düğmesinin yazacağı ayar; yalnız `toggle`. */
  settingKey?: AutomationKey;
  last: AutomationLast;
  next: string;
  /** Sıradaki çalışmanın kesin zamanı (ISO); yalnız bilinirse (ör. son plandan sonra ritim gününe düşen). */
  nextAt?: string;
  /** Satırın altında görünen uyarı (ör. onaysız tavan); yoksa yok. */
  note?: string;
}

export interface AutomationInput {
  workspace: Workspace;
  /** Yeniden eskiye panel işleri (`listJobs`). */
  jobs: readonly PanelJob[];
  now: Date;
  /** Onaylı fikri kendiliğinden üretme hazır mı? Değilse satır "yakında" ve devre dışıdır. */
  produceReady: boolean;
}

function lastOf(id: AutomationId, jobs: readonly PanelJob[], timeZone: string): AutomationLast & { finishedAt?: string } {
  const own = jobs.filter((job) => !job.dryRun && ROW_JOB_KINDS[id].includes(job.kind));
  const active = own.find((job) => job.status === "running" || job.status === "queued");
  if (active !== undefined) return active.status === "running" ? { state: "running", text: COPY.last.running } : { state: "queued", text: COPY.last.queued };
  const done = own.find((job) => job.finishedAt !== undefined);
  if (done === undefined || done.finishedAt === undefined) return { state: "never", text: COPY.last.never };
  const phrase = jobOutcomePhrase({ status: done.status, outcome: done.result?.outcome });
  const when = formatDateTime(done.finishedAt, timeZone);
  return { state: "done", at: done.finishedAt, finishedAt: done.finishedAt, text: [when, phrase].filter((part): part is string => part !== undefined).join(" · ") };
}

function nextWeeklyPlan(last: { finishedAt?: string }, everyDays: number, now: Date, timeZone: string): { text: string; at?: string } {
  if (last.finishedAt === undefined) return { text: COPY.next.nextDailyRun };
  const due = Date.parse(last.finishedAt) + everyDays * DAY_MS;
  if (due <= now.getTime()) return { text: COPY.next.nextDailyRun };
  const when = formatDateTime(new Date(due), timeZone);
  return when === undefined ? { text: COPY.next.nextDailyRun } : { text: `${COPY.next.dueAt} ${when}.`, at: new Date(due).toISOString() };
}

/** Kapalı satırın sıradaki cümlesi: "Kapalı · açarsan bir sonraki günlük turda." */
const ifOn = (text: string): string => `${COPY.next.off} ${text.charAt(0).toLocaleLowerCase("tr-TR")}${text.slice(1)}`;

function nextDailyMeasure(last: { finishedAt?: string }, now: Date, timeZone: string): string {
  if (last.finishedAt === undefined) return COPY.next.nextDailyRun;
  return toDayKey(last.finishedAt, timeZone) === toDayKey(now, timeZone) ? COPY.next.tomorrow : COPY.next.today;
}

export function buildAutomationRows({ workspace, jobs, now, produceReady }: AutomationInput): AutomationRow[] {
  const flags = automationFlagsOf(workspace);
  const tz = workspace.timezone;
  const base = (id: AutomationId) => ({ id, name: COPY.rows[id].name, does: COPY.rows[id].does, money: COPY.rows[id].money });

  const planLast = lastOf("weekly_plan", jobs, tz);
  const planNote = flags.weeklyPlan && workspace.agentMonthlyCapUsd === undefined ? COPY.notes.noCap : undefined;
  const measureLast = lastOf("daily_measure", jobs, tz);
  const produceLast = lastOf("produce", jobs, tz);
  const shareLast = lastOf("share", jobs, tz);
  const everyDays = agentSettingsOf(workspace).collectEveryDays;
  const planNext = nextWeeklyPlan(planLast, everyDays, now, tz);
  const measureNext = nextDailyMeasure(measureLast, now, tz);

  return [
    {
      ...base("weekly_plan"), mode: "toggle", enabled: flags.weeklyPlan, settingKey: "weeklyPlan", last: planLast,
      next: flags.weeklyPlan ? planNext.text : ifOn(planNext.text),
      ...(flags.weeklyPlan && planNext.at !== undefined ? { nextAt: planNext.at } : {}),
      ...(planNote === undefined ? {} : { note: planNote }),
    },
    {
      ...base("daily_measure"), mode: "toggle", enabled: flags.measure, settingKey: "measure", last: measureLast,
      next: flags.measure ? measureNext : ifOn(measureNext),
    },
    produceReady
      ? { ...base("produce"), mode: "toggle", enabled: flags.produce, settingKey: "produce", last: produceLast, next: flags.produce ? COPY.next.afterPlanApproval : ifOn(COPY.next.afterPlanApproval) }
      : { ...base("produce"), mode: "soon", enabled: false, last: produceLast, next: COPY.next.soon },
    { ...base("share"), mode: "always", enabled: true, last: shareLast, next: COPY.next.atScheduledTime },
  ];
}
