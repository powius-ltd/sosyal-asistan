/**
 * Haftalık akışın (Topla → İncele → Plan → Seç → Fiş) girdisi ve çıktısı. Saf: depo, saat, ağ yok (`derive.ts`).
 * Ölçülemeyen (okunamadı) değer `undefined`'dır, 0 / boş liste değil; "yok" ile "okunamadı" ayrı kalır (`null` = yok).
 */
import type { IdeaStatus } from "@/lib/domain/intel";
import type { JobKind } from "@/lib/domain/panel-job";

export const WEEKLY_FLOW_STEP_KEYS = ["collect", "analyze", "plan", "select", "ticket"] as const;
export type WeeklyFlowStepKey = (typeof WEEKLY_FLOW_STEP_KEYS)[number];

export type WeeklyFlowState = "done" | "active" | "waiting" | "blocked";

export interface WeeklyFlowPlanIdea {
  id: string;
  status: IdeaStatus;
}

export interface WeeklyFlowInput {
  /** İstekteki tek saat. */
  now: Date;
  /** Son başarılı toplama (ISO); `null` = hiç toplanmadı, `undefined` = okunamadı. */
  lastCollectedAt?: string | null;
  /** Ajanın toplama sıklığı (gün; `workspaces.collect_every_days`); bilinmiyorsa varsayılan. */
  collectEveryDays?: number;
  /** Sırada bekleyen / çalışan işlerin türleri; `undefined` = okunamadı (iş yok sayılır). */
  activeJobKinds?: readonly JobKind[];
  /** İncelenmeyi bekleyen video sayısı; `undefined` = okunamadı. */
  pendingAnalysis?: number;
  /** İçinde bulunulan haftanın Pazartesi'si (YYYY-AA-GG). */
  currentWeekStart: string;
  /** Son plan: `null` = hiç plan yok, `undefined` = okunamadı. Yalnız plana girenler (adaylar değil). */
  plan?: { weekStart: string; ideas: readonly WeeklyFlowPlanIdea[] } | null;
  /** Fişi olan fikirlerin kimlikleri; `undefined` = okunamadı / fiş kaydı yok. */
  ticketIdeaIds?: ReadonlySet<string> | readonly string[];
}

export type WeeklyFlowAction = { kind: "link"; href: string } | { kind: "chat"; message: string };

export interface WeeklyFlowStep {
  key: WeeklyFlowStepKey;
  state: WeeklyFlowState;
  /** Düz Türkçe, panel jargonu yok. */
  reason: string;
  action?: WeeklyFlowAction;
  /** İkinci yol (örn. Seç: sohbetin yanında plan sayfası). */
  secondaryAction?: WeeklyFlowAction;
}
