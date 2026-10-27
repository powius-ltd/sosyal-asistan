/**
 * İçerik adayları (kod): fikir üretimine giren, ≥ 2 farklı kanıtı ve ≥ 1 rakip tutanı olan yönler. Her aday bir rakip tutanından
 * (tohum) doğar; tohumun girdiği uygun gruplardan (`isPromisingGroup`: yön) biri adayın yönüdür.
 *  - Kanıt = tohum + aynı gruptaki, baz çizgisinin ≥ 1,5 katı DESTEKÇİ videolar (en çok 4 kanıt). Destekçi olarak önce tohum olmayan
 *    videolar alınır: aynı tutanlar her adayın kanıtına dolmasın, her aday kendi tohumuyla ayrışsın. Destekçi yoksa son çare olarak
 *    başka bir tohum eklenir; hiçbiri yoksa aday olmaz (≥ 2 kanıt kuralı).
 *  - Çeşitlilik: tohumlar lift sırasıyla işlenir; her biri önce başka bir adayın almadığı yönü seçer, yoksa kullanılmış yöne düşer.
 *  - Sıra = kanıt ortalama lift × yenilik × kendi tutan konularına uyum. Kendi tutanı ya da küme yoksa uyum ölçülemez
 *    (`ownTopicMatch` undefined) ve çarpan 1'dir — uyum olmaması cezalandırılmaz.
 *  - Rakipsiz mod (`mode = "own"`, `mode.ts`): tohum KENDİ tutanıdır (≥ 3x; yoksa ≥ 2x), kanıt aynı grubun kendi videolarıdır; "≥ 1 tutan"
 *    kuralı kendi tutanıyla sağlanır (`ownWinnerIds`), yenilik ve konu uyumu uygulanmaz (çarpan 1). `extraGroups` (tekrarla / seriye çevir)
 *    ek uygun grup olarak, her tohumun önce denediği yön olur.
 */
import {
  CANDIDATE_EVIDENCE_MAX,
  CANDIDATE_EVIDENCE_MIN,
  CANDIDATE_EVIDENCE_MIN_LIFT,
  CANDIDATE_LIMIT,
  CANDIDATE_SEED_MAX,
  CANDIDATE_SEED_MIN_STRONG,
  GROUP_WINDOW_DAYS,
  OWN_SEED_MIN_LIFT,
  OWN_SEED_RELAXED_LIFT,
  OWN_TOPIC_FIT_BOOST,
  OWN_WINNER_DAYS,
  OWN_WINNER_MIN_LIFT,
  RIVAL_WINNER_MIN_LIFT,
  RIVAL_WINNER_RELAXED_LIFT,
} from "@/lib/insights/constants";
import { byLiftDesc, groupKeyId, isPromisingGroup, type ScoredGroup } from "@/lib/insights/groups";
import type { PlanMode } from "@/lib/insights/mode";
import { withinDays, type Pool, type PoolItem } from "@/lib/insights/pool";
import type { PlanCandidate } from "@/lib/insights/types";
import { pickWinners } from "@/lib/insights/winners";
import { mean } from "@/lib/metrics/stats";

/** Kendi tutan videolarının (son 90 gün, ≥ 1,5x) konu kümeleri; yoksa undefined (uyum ölçülemez). */
function ownWinnerClusterIds(pool: Pool): ReadonlySet<string> | undefined {
  const ids = new Set<string>();
  for (const pi of pool.own) {
    if (pi.lift !== undefined && pi.lift >= OWN_WINNER_MIN_LIFT && withinDays(pi, pool.nowMs, OWN_WINNER_DAYS)) for (const c of pi.clusters) ids.add(c.id);
  }
  return ids.size > 0 ? ids : undefined;
}

function evidenceFor(seed: PoolItem, group: ScoredGroup, seeds: ReadonlySet<PoolItem>): PoolItem[] {
  const others = group.items.filter((pi) => pi !== seed && pi.lift !== undefined && pi.lift >= CANDIDATE_EVIDENCE_MIN_LIFT).sort(byLiftDesc);
  const supporters = others.filter((pi) => !seeds.has(pi));
  return [seed, ...(supporters.length > 0 ? supporters.slice(0, CANDIDATE_EVIDENCE_MAX - 1) : others.slice(0, 1))];
}

function candidateOf(seed: PoolItem, group: ScoredGroup, evidence: readonly PoolItem[], ownClusters: ReadonlySet<string> | undefined, mode: PlanMode): PlanCandidate {
  const [minLift, relaxedLift] = mode === "own" ? [OWN_SEED_MIN_LIFT, OWN_SEED_RELAXED_LIFT] : [RIVAL_WINNER_MIN_LIFT, RIVAL_WINNER_RELAXED_LIFT];
  const strong = evidence.filter((pi) => (pi.lift ?? 0) >= minLift);
  const winners = strong.length > 0 ? strong : evidence.filter((pi) => (pi.lift ?? 0) >= relaxedLift);
  const winnerIds = winners.map((pi) => pi.item.id);
  const match = ownClusters === undefined ? undefined : evidence.filter((pi) => pi.clusters.some((c) => ownClusters.has(c.id))).length / evidence.length;
  const evidenceMeanLift = mean(evidence.map((pi) => pi.lift ?? 0)) ?? 0;
  return {
    id: `cand:${seed.item.id}`,
    group: group.group,
    value: group.value,
    label: group.label,
    seedContentItemId: seed.item.id,
    evidenceContentIds: evidence.map((pi) => pi.item.id),
    basis: mode,
    rivalWinnerIds: mode === "own" ? [] : winnerIds,
    ownWinnerIds: mode === "own" ? winnerIds : [],
    relaxedWinner: strong.length === 0,
    evidenceMeanLift,
    novelty: group.novelty,
    ownTried: group.ownTried,
    ownTopicMatch: match,
    rankScore: evidenceMeanLift * group.novelty * (1 + OWN_TOPIC_FIT_BOOST * (match ?? 0)),
    // Yönün güveni (örnek sayısı + baz çizgisi tavanı): aday ile yön aynı grupta aynı güveni taşır.
    confidence: group.confidence,
  };
}

export function buildCandidates(pool: Pool, groups: readonly ScoredGroup[], mode: PlanMode = "rivals", extraGroups: readonly ScoredGroup[] = []): PlanCandidate[] {
  const seeds = pickWinners(mode === "own" ? pool.own : pool.rivals, pool.nowMs, {
    days: GROUP_WINDOW_DAYS,
    minLift: mode === "own" ? OWN_SEED_MIN_LIFT : RIVAL_WINNER_MIN_LIFT,
    relaxedLift: mode === "own" ? OWN_SEED_RELAXED_LIFT : RIVAL_WINNER_RELAXED_LIFT,
    minStrong: CANDIDATE_SEED_MIN_STRONG,
    limit: CANDIDATE_SEED_MAX,
  }).items;
  const seedSet = new Set(seeds);
  const eligible = [...extraGroups, ...groups.filter(isPromisingGroup)];
  const ownClusters = mode === "own" ? undefined : ownWinnerClusterIds(pool);
  const usedGroups = new Set<string>();
  const candidates: PlanCandidate[] = [];

  for (const seed of seeds) {
    const containing = eligible.filter((g) => g.items.includes(seed));
    const preferred = [...containing.filter((g) => !usedGroups.has(groupKeyId(g))), ...containing.filter((g) => usedGroups.has(groupKeyId(g)))];
    for (const group of preferred) {
      const evidence = evidenceFor(seed, group, seedSet);
      if (evidence.length < CANDIDATE_EVIDENCE_MIN) continue;
      usedGroups.add(groupKeyId(group));
      candidates.push(candidateOf(seed, group, evidence, ownClusters, mode));
      break;
    }
  }
  return candidates.sort((a, b) => b.rankScore - a.rankScore || b.evidenceMeanLift - a.evidenceMeanLift || a.id.localeCompare(b.id)).slice(0, CANDIDATE_LIMIT);
}
