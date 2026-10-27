/**
 * Giriş ekranının girdisi ve çıktısı (SAF; `derive.ts`). 7 adım: Analiz → Plan → Onayın → Senaryo → Üretim → Paylaşım → Takip.
 * İlk ikisi kendiliğinden yürür (haftalık akışın Topla / İncele / Plan adımlarından türer); kalanı haftanın plan videolarının
 * fişlerinden: her video kendi aşamasındadır, hattın aşaması en geride kalan videonunkidir.
 */
import type { IdeaStatus } from "@/lib/domain/intel";
import type { OrderKind } from "@/lib/studio-order/create-for-idea";
import type { OrderStatus } from "@/lib/studio-order/schema";
import type { WeeklyFlowAction, WeeklyFlowStep } from "@/lib/weekly-flow/types";

export const ENTRY_STEP_KEYS = ["analyze", "plan", "approve", "script", "produce", "share", "track"] as const;
export type EntryStepKey = (typeof ENTRY_STEP_KEYS)[number];

/** Videonun aşaması (Onayın'dan Takip'e). */
export const ENTRY_STAGES = ["approve", "script", "produce", "share", "track"] as const;
export type EntryStage = (typeof ENTRY_STAGES)[number];

/** `active` = sıra sende; `running` = biz / sistem çalışıyor (kullanıcıdan bir şey beklenmez). */
export type EntryState = "done" | "active" | "running" | "waiting";

export interface EntryVideoInput {
  ideaId: string;
  title: string;
  rationale: string;
  ideaStatus: IdeaStatus;
  /** Önerilen paylaşım anı (ISO). */
  slotAt?: string;
  /** Etkin fiş; yoksa undefined. */
  order?: { id: string; status: OrderStatus; kind?: OrderKind };
}

export interface EntryInput {
  /** Haftalık akışın türetilmiş adımları (`deriveWeeklyFlow`). */
  flow: readonly WeeklyFlowStep[];
  /** Bu haftanın planı varsa plan videoları (sıralı); plan yoksa boş. */
  videos: readonly EntryVideoInput[];
}

export interface EntryStep {
  key: EntryStepKey;
  state: EntryState;
  reason: string;
  action?: WeeklyFlowAction;
}

export interface EntryVideo extends EntryVideoInput {
  stage: EntryStage;
}

export interface EntryView {
  steps: EntryStep[];
  videos: EntryVideo[];
}
