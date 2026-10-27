/**
 * "Tekrarla / seriye çevir" yönü (rakipsiz mod, kod): en çok tutan kendi videoların (≥ 3x; yoksa ≥ 2x, en çok 3) kendisi bir yöndür: aynı
 * konuyu yeni bir açıyla ya da "2. bölüm" olarak yeniden çekmek. Gruplardan (hook/süre/CTA/konu) bağımsızdır; bu yüzden sentetik bir
 * `ScoredGroup`'tur (`repeat: true`, eksen `topic_cluster` ama gerçek bir küme değil). Puan aynı büzme ile hesaplanır, yenilik çarpanı yoktur.
 * Tutan yoksa yön yoktur (undefined).
 */
import { OWN_SEED_MIN_LIFT, OWN_SEED_RELAXED_LIFT, OWN_WINNER_DAYS, REPEAT_WINNERS_MAX } from "@/lib/insights/constants";
import type { DirectionFeedback, FeedbackIndex } from "@/lib/insights/feedback";
import { groupKeyId, shrinkImpact, type ScoredGroup } from "@/lib/insights/groups";
import type { Pool } from "@/lib/insights/pool";
import { pickWinners } from "@/lib/insights/winners";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";

export const REPEAT_VALUE = "repeat_winners";
export const REPEAT_LABEL = "Tekrarla / seriye çevir";

export function repeatGroup(pool: Pool, feedback?: FeedbackIndex): ScoredGroup | undefined {
  const winners = pickWinners(pool.own, pool.nowMs, { days: OWN_WINNER_DAYS, minLift: OWN_SEED_MIN_LIFT, relaxedLift: OWN_SEED_RELAXED_LIFT, minStrong: REPEAT_WINNERS_MAX, limit: REPEAT_WINNERS_MAX }).items;
  if (winners.length === 0) return undefined;
  const summary = summarizeLiftSamples(winners.map((pi) => ({ lift: pi.lift, lowBaseline: pi.lowBaseline })));
  const key = { group: "topic_cluster" as const, value: REPEAT_VALUE, label: REPEAT_LABEL };
  const groupFeedback: DirectionFeedback | undefined = feedback?.get(groupKeyId(key));
  const shrunk = shrinkImpact(summary.medianLift, summary.n);
  return {
    ...key,
    items: winners,
    liftN: summary.n,
    impact: summary.medianLift,
    outlierCount: summary.outlierCount,
    confidence: summary.confidence,
    ownTried: true,
    novelty: 1,
    feedback: groupFeedback,
    score: shrunk === undefined ? undefined : shrunk * (groupFeedback?.multiplier ?? 1),
    comparable: true,
    basis: "own",
    repeat: true,
  };
}
