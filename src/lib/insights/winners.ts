/**
 * "Ne tuttu" bölümü (kod): rakip son 30 gün ≥ 3x (3'ten azsa ≥ 2x'e gevşer ve işaretlenir), en çok 5; kendi son 90 gün ≥ 1,5x,
 * en çok 3. Yalnız ölçülmüş VE olgun lift sayılır (<3 günlük içeriğin lift'i alt sınırdır, `usableLift`); niş dışı içerik havuza
 * hiç girmez (`pool.ts`). "Neden tuttu" ve alıntı LLM'in işidir (`why`/`quote` boş); `analyzed` yalnız doğrulanmış hook analizi var mı
 * der, `evidenceUnverified` analiz var ama kanıtı doğrulanamadı der (iki durum metinde ayrışır).
 * `pickWinners` aday tohumlarında da kullanılır (`candidates.ts`): tek eşik-gevşetme kuralı.
 */
import type { PlanWinner, WinnersSection } from "@/lib/domain/weekly-plan";
import {
  OWN_WINNER_DAYS,
  OWN_WINNER_MAX,
  OWN_MODE_WINNER_MAX,
  OWN_WINNER_MIN_LIFT,
  RIVAL_WINNER_DAYS,
  RIVAL_WINNER_MAX,
  RIVAL_WINNER_MIN_LIFT,
  RIVAL_WINNER_MIN_STRONG,
  RIVAL_WINNER_RELAXED_LIFT,
} from "@/lib/insights/constants";
import { byLiftDesc } from "@/lib/insights/groups";
import type { PlanMode } from "@/lib/insights/mode";
import { withinDays, type Pool, type PoolItem } from "@/lib/insights/pool";
import { REASON_PLAIN } from "@/lib/plain-language-plan";

export interface PickOptions {
  days: number;
  minLift: number;
  /** `minLift`'i sağlayan `minStrong`'dan azsa bu eşiğe gevşer. */
  relaxedLift?: number;
  minStrong?: number;
  limit: number;
}

export interface Picked {
  items: PoolItem[];
  /** Gösterilenlerden en az biri `minLift`'in altında (eşik gevşetildi ve işe yaradı). */
  relaxed: boolean;
}

/** Penceredeki, ölçülmüş lift'i eşiği geçen içerikler (lift azalan, en çok `limit`). */
export function pickWinners(items: readonly PoolItem[], nowMs: number, options: PickOptions): Picked {
  const measured = items.filter((pi) => pi.lift !== undefined && withinDays(pi, nowMs, options.days)).sort(byLiftDesc);
  const strong = measured.filter((pi) => (pi.lift ?? 0) >= options.minLift);
  const useRelaxed = options.relaxedLift !== undefined && strong.length < (options.minStrong ?? 0);
  const picked = (useRelaxed ? measured.filter((pi) => (pi.lift ?? 0) >= (options.relaxedLift ?? options.minLift)) : strong).slice(0, options.limit);
  return { items: picked, relaxed: picked.some((pi) => (pi.lift ?? 0) < options.minLift) };
}

export function winnerOf(pi: PoolItem): PlanWinner {
  const { item } = pi;
  return {
    contentItemId: item.id,
    ownerHandle: item.owner.handle,
    isOwn: pi.isOwn,
    lift: pi.lift ?? 0,
    views: item.metrics.views,
    publishedAt: item.publishedAt,
    durationSec: item.durationSec,
    hookType: pi.hookType,
    analyzed: pi.hookType !== undefined,
    // Alan yoksa (undefined) analiz hiç yok demektir; `true` = analiz var, kanıtı doğrulanamadı.
    ...(pi.evidenceUnverified ? { evidenceUnverified: true } : {}),
  };
}

/** Rakipsiz modda ("own") kendi tutanlar planın asıl dayanağıdır: en çok `OWN_MODE_WINNER_MAX` (aksi halde `OWN_WINNER_MAX`). */
export function buildWinners(pool: Pool, mode: PlanMode = "rivals"): WinnersSection {
  const rivals = pickWinners(pool.rivals, pool.nowMs, {
    days: RIVAL_WINNER_DAYS,
    minLift: RIVAL_WINNER_MIN_LIFT,
    relaxedLift: RIVAL_WINNER_RELAXED_LIFT,
    minStrong: RIVAL_WINNER_MIN_STRONG,
    limit: RIVAL_WINNER_MAX,
  });
  const own = pickWinners(pool.own, pool.nowMs, { days: OWN_WINNER_DAYS, minLift: OWN_WINNER_MIN_LIFT, limit: mode === "own" ? OWN_MODE_WINNER_MAX : OWN_WINNER_MAX });

  const measured = (items: readonly PoolItem[], days: number) => items.some((pi) => pi.lift !== undefined && withinDays(pi, pool.nowMs, days));
  const reasons: string[] = [];
  if (!measured(pool.rivals, RIVAL_WINNER_DAYS)) reasons.push(REASON_PLAIN.winnersNoRival(RIVAL_WINNER_DAYS));
  if (!measured(pool.own, OWN_WINNER_DAYS)) reasons.push(REASON_PLAIN.winnersNoOwn(OWN_WINNER_DAYS));
  return {
    rivals: rivals.items.map(winnerOf),
    own: own.items.map(winnerOf),
    relaxedThreshold: rivals.relaxed,
    unmeasuredReason: reasons.length > 0 ? reasons.join(" ") : undefined,
  };
}
