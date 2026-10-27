/**
 * Hazır soruların dayanağı (D3-11): hangi sorunun cevabı olduğunu söyleyen hafif okumalar. Önerilen soru boş cevap verirse ("söyleyemiyorum")
 * sohbetin ilk izlenimi bozulur; bu yüzden yalnız olgu paketinde karşılığı olan sorular önerilir (paketin kuralları `analyst/facts.ts`'tedir:
 * plan, 90 günlük tutan kendi videolar, en son yayımlanan kendi video, konu hücreleri, açı fırsatları). Tam paket (14 okuma) her sayfada kurulmaz: burada yalnız beş küçük okuma
 * vardır ve sonuç çalışma alanı başına kısa süre hatırlanır (saat çağıranın tek saatidir). Okunamayan sinyal `false` sayılır (soru çıkmaz).
 */
import "server-only";

import { OWN_BEST_WINDOW_DAYS } from "@/lib/agents/analyst/facts-own-best";
import { ageInDays } from "@/lib/agents/analyst/facts-own-latest";
import type { PanelRepository } from "@/lib/data/repository";
import { usesMatrix, type AccountType } from "@/lib/domain/account-type";
import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { DAY_MS } from "@/lib/time";

export interface StarterSignals {
  /** Planı (bu hafta ya da geçen hafta) var. */
  hasPlan: boolean;
  /** Son 90 günde kendi normalinin eşik katına ulaşmış kendi videosu var ("en iyi video" sorusu buna dayanır). */
  hasOwnBest: boolean;
  /** Yayın tarihi bilinen kendi videosu var ("son videom" sorusu paketteki `latest` olguya dayanır). */
  hasLatest: boolean;
  /** Konu × açılış matrisinde kendi hesabının tuttuğu hücre var. */
  hasTopicWinners: boolean;
  /** Açı × izleyici haritasında rakiplerde tutan, kendinde denenmemiş hücre var. */
  hasAngleOpportunity: boolean;
}

/** Hatırlama süresi (ms). */
export const SIGNALS_TTL_MS = 60_000;

const cache = new Map<string, { atMs: number; accountType: AccountType; signals: StarterSignals }>();

const safe = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await read();
  } catch {
    return undefined;
  }
};

export async function loadStarterSignals(repo: PanelRepository, wsId: string, accountType: AccountType, now: Date): Promise<StarterSignals> {
  const hit = cache.get(wsId);
  if (hit !== undefined && hit.accountType === accountType && now.getTime() - hit.atMs < SIGNALS_TTL_MS && now.getTime() >= hit.atMs) return hit.signals;

  const since = new Date(now.getTime() - OWN_BEST_WINDOW_DAYS * DAY_MS).toISOString();
  const [plans, ownBest, latest, topics, angles] = await Promise.all([
    safe(() => repo.listWeeklyPlans(wsId, { limit: 1 })),
    safe(() => repo.listContent(wsId, { ownerKind: "own", minTier: OUTLIER_MIN_TIER, hideImmature: true, since, limit: 1 })),
    safe(() => repo.listContent(wsId, { ownerKind: "own", sort: "recent", limit: 1 })),
    usesMatrix(accountType, "topic_hook") ? safe(() => repo.getTopicHookMatrix(wsId)) : undefined,
    usesMatrix(accountType, "angle_funnel") ? safe(() => repo.getCreativeMatrix(wsId)) : undefined,
  ]);
  const signals: StarterSignals = {
    hasPlan: (plans?.length ?? 0) > 0,
    hasOwnBest: (ownBest?.items.length ?? 0) > 0,
    hasLatest: ageInDays(latest?.items[0]?.publishedAt, now) !== undefined,
    hasTopicWinners: (topics?.winners.length ?? 0) > 0,
    hasAngleOpportunity: (angles?.opportunities.length ?? 0) > 0,
  };
  cache.set(wsId, { atMs: now.getTime(), accountType, signals });
  return signals;
}

/** Test için. */
export function clearStarterSignalsCache(): void {
  cache.clear();
}
