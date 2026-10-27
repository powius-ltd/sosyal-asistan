/**
 * TEST YARDIMCISI (yalnız testler içe aktarır): küçük, elle kurulan senaryolar için içerik ve girdi üreticileri. Skor doğrudan
 * verilir (`lift`, `immature`); gerçek baz çizgisi hesabı gereken senaryolar `faz2-fixture.ts`'i kullanır.
 */
import type { ContentItem } from "@/lib/domain/content";
import {
  ORNEK_ID,
  FIXTURE_COMPETITORS,
  FIXTURE_NOW,
  FIXTURE_OWN,
  FIXTURE_WORKSPACE,
  NEXT_WEEK,
} from "@/lib/insights/testing/faz2-fixture";
import type { PlanDraftInput } from "@/lib/insights/types";

const OWNERS = {
  ornek: { kind: "own" as const, id: ORNEK_ID, handle: "ornekhesap" },
  noelle: { kind: "competitor" as const, id: "rv-noelle", handle: "noelle" },
  align: { kind: "competitor" as const, id: "rv-align", handle: "align" },
  evelyn: { kind: "competitor" as const, id: "rv-evelyn", handle: "evelyn" },
};

export type OwnerKey = keyof typeof OWNERS;

export interface Spec {
  id: string;
  owner: OwnerKey;
  daysAgo?: number;
  publishedAt?: string;
  dur?: number;
  lift?: number;
  immature?: boolean;
  /** Baz çizgisi düşük güvenli (`score.lowConfidence`); varsayılan false. Güven tavanı testleri için. */
  lowBaseline?: boolean;
  caption?: string;
  views?: number;
  format?: ContentItem["format"];
}

export const DAY = 86_400_000;
const COMMENT_CTA = "Comment RENEW below.";

/** Yorum-anahtar-kelime CTA'lı açıklama. */
export const CTA_CAPTION = COMMENT_CTA;

export function video(spec: Spec): ContentItem {
  const owner = OWNERS[spec.owner];
  const lift = spec.lift;
  const tier = lift === undefined ? undefined : lift >= 5 ? 4 : lift >= 3 ? 3 : lift >= 2 ? 2 : lift >= 1.5 ? 1 : 0;
  return {
    id: spec.id,
    workspaceId: "ws",
    platform: "instagram",
    externalId: `ext-${spec.id}`,
    owner: { ...owner },
    format: spec.format ?? "short_video",
    publishedAt: spec.publishedAt ?? new Date(FIXTURE_NOW.getTime() - (spec.daysAgo ?? 5) * DAY).toISOString(),
    caption: spec.caption,
    hashtags: [],
    durationSec: spec.dur,
    missingFields: [],
    metrics: { views: spec.views ?? 1_000, viewsKind: "ig_play_count", likes: 10, extra: {} },
    score: { lift, liftTier: tier, lowConfidence: spec.lowBaseline ?? false, immature: spec.immature ?? false },
    hasTranscript: false,
    firstSeenAt: "2026-09-29T00:00:00.000Z",
  };
}

/** `count` rakip videosu: aynı süre/CTA, lifts sırayla. */
export function rivalVideos(prefix: string, owner: OwnerKey, dur: number, lifts: readonly (number | undefined)[], caption?: string): ContentItem[] {
  return lifts.map((lift, i) => video({ id: `${prefix}${i + 1}`, owner, dur, lift, caption, daysAgo: 3 + i }));
}

export function planInput(items: readonly ContentItem[], over: Partial<PlanDraftInput> = {}): PlanDraftInput {
  return { weekStart: NEXT_WEEK, now: FIXTURE_NOW, workspace: FIXTURE_WORKSPACE, own: FIXTURE_OWN, competitors: FIXTURE_COMPETITORS, items, ...over };
}
