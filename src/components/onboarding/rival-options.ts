/**
 * Benzer hesap seçiminin satırları (saf): keşfin bulduğu adaylar (`listDiscoveryCandidates`) + kullanıcının elle eklediği adaylar
 * (`listCompetitors({ status: "candidate" })`) tek listede. Sıra: kullanıcının ekledikleri → boyu benzeyenler → diğerleri (kendi içinde
 * geliş sırası korunur). İlk `ONBOARDING_RIVALS_PRESELECT` satır ön seçilidir; seçim kullanıcınındır.
 */
import type { Competitor, DiscoveryCandidateView } from "@/lib/domain/competitor";
import { ONBOARDING_RIVALS_PRESELECT } from "@/lib/domain/onboarding-job";

export interface RivalOption {
  id: string;
  handle: string;
  displayName?: string;
  /** Ölçülemediyse yok (0 değil). */
  followers?: number;
  /** Takipçisi kendi hesabın yakınında; ölçülemediyse yok. */
  similarSize?: boolean;
  /** Kullanıcı elle ekledi. */
  manual: boolean;
}

type CandidateRow = Pick<Competitor, "id" | "handle" | "displayName" | "followers" | "source">;

const rank = (option: RivalOption): number => (option.manual ? 0 : option.similarSize === true ? 1 : 2);

export function buildRivalOptions(discovered: readonly DiscoveryCandidateView[], candidates: readonly CandidateRow[]): RivalOption[] {
  const options = new Map<string, RivalOption>();
  for (const view of discovered) {
    options.set(view.competitorId, {
      id: view.competitorId,
      handle: view.handle,
      ...(view.displayName === undefined ? {} : { displayName: view.displayName }),
      ...(view.followers === undefined ? {} : { followers: view.followers }),
      ...(view.similarSize === undefined ? {} : { similarSize: view.similarSize }),
      manual: false,
    });
  }
  for (const row of candidates) {
    if (options.has(row.id)) continue;
    options.set(row.id, {
      id: row.id,
      handle: row.handle,
      ...(row.displayName === undefined ? {} : { displayName: row.displayName }),
      ...(row.followers === undefined ? {} : { followers: row.followers }),
      manual: row.source === "manual",
    });
  }
  // `sort` kararlıdır: aynı sıradakiler geliş sırasını korur.
  return [...options.values()].sort((a, b) => rank(a) - rank(b));
}

/** Ön seçili satırların kimlikleri (listenin başından). */
export function preselectedRivalIds(options: readonly RivalOption[]): string[] {
  return options.slice(0, ONBOARDING_RIVALS_PRESELECT).map((option) => option.id);
}
