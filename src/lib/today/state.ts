/**
 * "Bugün" ekranının durumu ve tek çağrıda bütünü (`buildToday`): boş çalışma alanı · karar var · notlar bayat · karar yok. Saf.
 * Öncelik: boş alan her şeyin önündedir (kurulum kartları olsa da ekran "henüz bakmadım" der); karar varsa bayatlık durumu değil
 * sözün altındaki not taşır (`voice.note.stale`).
 */
import { formatNumber } from "@/lib/format";
import { buildOverviewSummary, NO_ASKS_TEXT } from "@/lib/overview/summary";
import { buildDecisionQueue } from "@/lib/today/decision-queue";
import type { DecisionCard, Today, TodayInput, TodayState, TodayVoice } from "@/lib/today/types";
import { buildTodayVoice } from "@/lib/today/voice";

/** "1 kararın var." / "3 kararın var." */
export function decisionCountText(count: number): string {
  return `${formatNumber(count)} kararın var.`;
}

export function todayState(input: TodayInput, queue: readonly DecisionCard[], voice: TodayVoice): TodayState {
  const summary = buildOverviewSummary(input.summary);
  if (summary.empty) return { kind: "empty", text: summary.where?.text ?? NO_ASKS_TEXT };
  if (queue.length > 0) return { kind: "decisions", text: decisionCountText(queue.length) };
  if (voice.note?.stale) return { kind: "stale", text: voice.note.stale.text };
  return { kind: "clear", text: NO_ASKS_TEXT };
}

/** Söz + kuyruk + durum (sayfa bunu çağırır; parçalar ayrı da kullanılabilir). */
export function buildToday(input: TodayInput): Today {
  const queue = buildDecisionQueue(input);
  const voice = buildTodayVoice(input);
  return { state: todayState(input, queue, voice), voice, queue };
}
