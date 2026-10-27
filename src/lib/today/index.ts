/**
 * "Bugün" ana ekranının saf mantık katmanı: AI'ın kısa sözü + karar kuyruğu + ekran durumu ve bunların girdi yükleyicisi.
 * Bileşen ve sayfa yalnız buradan içe aktarır. Kullanım: `buildToday(await loadTodayInput(repo, wsId, now, { operator }))`.
 */
export { buildDecisionQueue } from "@/lib/today/decision-queue";
export { PASTE_LINK_WINDOW_DAYS } from "@/lib/today/decision-cards";
export { loadTodayInput, TODAY_LIST_LIMIT, TODAY_PERIOD_DAYS, type LoadTodayOptions } from "@/lib/today/load-input";
export { buildToday, decisionCountText, todayState } from "@/lib/today/state";
export { buildTodayVoice, STALE_NOTE_TEXT, strongestBriefingItem } from "@/lib/today/voice";
export { DECISION_KINDS } from "@/lib/today/types";
export type {
  DecisionAction,
  DecisionActionKey,
  DecisionCard,
  DecisionKind,
  Today,
  TodayInput,
  TodayJobsState,
  TodayPublishJob,
  TodayState,
  TodayStateKind,
  TodayVoice,
  TodayVoiceNote,
} from "@/lib/today/types";
