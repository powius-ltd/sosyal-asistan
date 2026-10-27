/**
 * Yönetici ajanın KAPISI (saf; veritabanı, saat, ağ yok). Beyin (LLM) bir eylem önerir; burası onu ya geçirir ya reddeder. LLM çıktısına
 * güvenilmez: kapı kapalı listedir, listede olmayan her şey reddedilir.
 *
 * Açılabilir iş: yalnız `chain.ts`'in $0 türleri + `AGENT_CAP_KINDS` (collect, discover; tavan onaylı + kalan hak yeter + sıklık doldu).
 * ASLA: yayın onayı, fiş onayı, tavan değişikliği, tavan aşımı, adayı izlemeye alma, reklam. Bunlar eylem listesinde yoktur; ad olarak
 * gelirlerse `forbidden_action` ile açıkça reddedilir. Para kapısının asıl koruması DB trigger'ı + `spendGate` + `agentCeiling`'dedir; burası ilk katmandır.
 */
import { canAfford, type AgentBudget } from "@/lib/agents/director/budget";
import { isChainSafeKind } from "@/lib/cycle/chain";
import { CYCLE_RULES } from "@/lib/cycle/rules";
import { DAY_MS } from "@/lib/time";
import { AGENT_CAP_KINDS, type JobKind } from "@/lib/domain/panel-job";

/** Ajanın yapabildiği eylemler (kapalı liste). */
export const DIRECTOR_ACTIONS = ["open_job", "ask_approval", "notify", "wait"] as const;
export type DirectorAction = (typeof DIRECTOR_ACTIONS)[number];

/** Ajanın yapamayacağı ve adı bilinen eylemler: model bunları önerirse neden açıkça söylenir. Liste dışı her ad zaten reddedilir. */
export const FORBIDDEN_ACTIONS = [
  "approve_publish",
  "approve_slip",
  "set_cap",
  "raise_cap",
  "exceed_cap",
  "track_candidate",
  "ads",
  "publish_now",
] as const;

/** Rakip bulma bu kadar günden sık açılmaz (toplama sıklığı çalışma alanı ayarıdır, bu sabit değildir). */
export const DISCOVER_MIN_DAYS = 14;

export interface DirectorProposal {
  action: string;
  /** `open_job`: açılacak iş türü. */
  kind?: string;
  /** `order`: fişin hafta başı. */
  week?: string;
  reason?: string;
}

export interface GuardContext {
  now: Date;
  budget: AgentBudget;
  /** Ücretli adımların tahmini (USD), tür başına; tahmini olmayan ücretli iş açılmaz. */
  estimates: Partial<Record<"collect" | "discover", number>>;
  /** Çalışma alanında sırada ya da koşan iş var mı. */
  activeJob: boolean;
  /** Bugün (UTC günü) ajanın / zincirin açtığı iş sayısı. */
  jobsToday: number;
  /** Son ücretli işlerin açılış anı (ISO), tür başına. */
  lastPaidAt: Partial<Record<"collect" | "discover", string>>;
  /** Toplama sıklığı (gün; çalışma alanı ayarı). */
  collectEveryDays: number;
}

export type GuardReason =
  | "forbidden_action"
  | "unknown_action"
  | "unknown_kind"
  | "missing_kind"
  | "active_job"
  | "daily_cap"
  | "cap_not_approved"
  | "cap_exceeded"
  | "no_estimate"
  | "too_soon";

export type GuardVerdict =
  | { allowed: true; action: DirectorAction; kind?: JobKind; week?: string }
  | { allowed: false; reason: GuardReason; detail: string };

const deny = (reason: GuardReason, detail: string): GuardVerdict => ({ allowed: false, reason, detail });

const isAgentCapKind = (kind: string): kind is (typeof AGENT_CAP_KINDS)[number] => (AGENT_CAP_KINDS as readonly string[]).includes(kind);

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (iso === undefined) return undefined;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? undefined : (now.getTime() - at) / DAY_MS;
}

export function guardProposal(proposal: DirectorProposal, ctx: GuardContext): GuardVerdict {
  const action = proposal.action;
  if ((FORBIDDEN_ACTIONS as readonly string[]).includes(action)) return deny("forbidden_action", `Ajan bu işi yapamaz: ${action}.`);
  if (!(DIRECTOR_ACTIONS as readonly string[]).includes(action)) return deny("unknown_action", `Tanınmayan eylem: ${action}.`);
  if (action !== "open_job") return { allowed: true, action: action as DirectorAction };

  const kind = proposal.kind;
  if (kind === undefined || kind === "") return deny("missing_kind", "İş türü verilmedi.");
  const week = proposal.week;
  // Kuru koşu / tür dışı: yalnız bilinen güvenli ya da tavanlı türler.
  const free = isChainSafeKind(kind as JobKind);
  const paid = isAgentCapKind(kind);
  if (!free && !paid) return deny("unknown_kind", `Ajan bu iş türünü açamaz: ${kind}.`);

  if (ctx.activeJob) return deny("active_job", "Çalışma alanında süren ya da sıradaki bir iş var.");
  if (ctx.jobsToday >= CYCLE_RULES.chainDailyMax) return deny("daily_cap", "Bugünkü iş sınırı doldu.");
  if (free) return { allowed: true, action: "open_job", kind: kind as JobKind, ...(week === undefined ? {} : { week }) };

  // Ücretli: onaylı tavan + kalan hak + sıklık.
  if (!ctx.budget.approved) return deny("cap_not_approved", "Aylık ajan tavanı onaylı değil.");
  const estimate = ctx.estimates[kind as "collect" | "discover"];
  if (estimate === undefined) return deny("no_estimate", "Ücretli işin tahmini yok.");
  if (!canAfford(ctx.budget, estimate)) return deny("cap_exceeded", "Aylık ajan tavanında bu iş için yeterli hak kalmadı.");
  const minDays = kind === "collect" ? ctx.collectEveryDays : DISCOVER_MIN_DAYS;
  const since = daysSince(ctx.lastPaidAt[kind as "collect" | "discover"], ctx.now);
  if (since !== undefined && since < minDays) return deny("too_soon", `Bu iş son ${minDays} günde zaten açıldı.`);
  return { allowed: true, action: "open_job", kind: kind as JobKind };
}
