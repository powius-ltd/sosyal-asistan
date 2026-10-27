import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdResult, AdVerdictStatus } from "@/lib/domain/ads";

/** Liste gruplarının sırası (önce harekete geçilecekler). */
export const AD_GROUP_KEYS = ["scale", "trim", "fatigued", "hold", "early", "undecided"] as const;
export type AdGroupKey = (typeof AD_GROUP_KEYS)[number];

const GROUP_OF: Record<AdVerdictStatus, AdGroupKey> = {
  scale: "scale",
  reduce: "trim",
  stop: "trim",
  fatigued: "fatigued",
  hold: "hold",
  learning: "early",
  insufficient_data: "early",
  undecided: "undecided",
};

export const adGroupOf = (status: AdVerdictStatus): AdGroupKey => GROUP_OF[status];

export interface AdGroup {
  key: AdGroupKey;
  title: string;
  hint: string;
  ads: AdResult[];
}

/** Reklamları öneriye göre gruplar (boş grup atlanır); grup içinde en çok harcayan önce. */
export function groupAds(ads: readonly AdResult[]): AdGroup[] {
  return AD_GROUP_KEYS.flatMap((key) => {
    const inGroup = ads.filter((ad) => adGroupOf(ad.verdict.status) === key).sort((a, b) => b.sums.spend - a.sums.spend);
    return inGroup.length === 0 ? [] : [{ key, ...AD_SCREEN_COPY.groups[key], ads: inGroup }];
  });
}
