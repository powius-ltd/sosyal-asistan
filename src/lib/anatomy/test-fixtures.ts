/** Yalnız testler için: en az alanla içerik, analiz ve girdi (mock depoya bağımlı olmadan). */
import type { AnatomyInput } from "@/lib/anatomy/aggregate";
import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import { liftTierFor, type ContentItem } from "@/lib/domain/content";
import type { AnalysisSection, ContentAnalysis, EditMetrics } from "@/lib/domain/intel";

export const NOW = new Date("2026-09-30T12:00:00.000Z");
const DAY = 86_400_000;

export const OWN: OwnAccount = {
  id: "own1", workspaceId: "w", platform: "instagram", handle: "ornek", followers: 1_400, connection: "scrape_only", scopes: [], createdAt: "2026-01-01T00:00:00.000Z",
};
export const RIVAL: Competitor = {
  id: "r1", workspaceId: "w", platform: "instagram", handle: "noelle", status: "tracked", source: "manual", missingFields: [], contentCount: 0, addedAt: "2026-01-01T00:00:00.000Z", followers: 20_000,
};

export interface VideoSpec {
  id: string;
  own?: boolean;
  lift?: number;
  immature?: boolean;
  lowConfidence?: boolean;
  daysAgo?: number;
  durationSec?: number;
  sections?: AnalysisSection[];
  hookText?: string;
  edit?: EditMetrics;
  /** false → analiz kanıtı doğrulanmamış. */
  verified?: boolean;
  /** true → analiz hiç yok. */
  noAnalysis?: boolean;
  format?: ContentItem["format"];
}

/** Hook + problem + öğreti + CTA: 92 sn'de örnek anatomi. */
export const SECTIONS: AnalysisSection[] = [
  { type: "hook", quote: "Sabah kahveni yanlış içiyorsun.", startSec: 0 },
  { type: "problem", quote: "Bunu yıllarca ben de yaptım.", startSec: 16 },
  { type: "proof", quote: "Çalışma şunu gösterdi.", startSec: 21 },
  { type: "insight", quote: "Önce su iç.", startSec: 40 },
  { type: "cta", quote: "Yorumlara KAHVE yaz.", startSec: 80 },
];

export function video(spec: VideoSpec): { item: ContentItem; analysis?: ContentAnalysis } {
  const owner = spec.own
    ? { kind: "own" as const, id: OWN.id, handle: OWN.handle }
    : { kind: "competitor" as const, id: RIVAL.id, handle: RIVAL.handle };
  const item: ContentItem = {
    id: spec.id, workspaceId: "w", platform: "instagram", externalId: `e-${spec.id}`, owner, format: spec.format ?? "short_video",
    publishedAt: new Date(NOW.getTime() - (spec.daysAgo ?? 10) * DAY).toISOString(), hashtags: [], durationSec: spec.durationSec ?? 92, missingFields: [],
    metrics: { views: 1_000, viewsKind: "ig_play_count", extra: {} },
    score: { lift: spec.lift, liftTier: liftTierFor(spec.lift), lowConfidence: spec.lowConfidence ?? false, immature: spec.immature ?? false },
    hasTranscript: false, firstSeenAt: "2026-09-01T00:00:00.000Z",
  };
  if (spec.noAnalysis) return { item };
  const analysis: ContentAnalysis = {
    id: `an-${spec.id}`, contentItemId: spec.id, status: "ok", hookText: spec.hookText ?? "Sabah kahveni yanlış içiyorsun.", sections: spec.sections ?? SECTIONS, labels: [],
    editMetrics: spec.edit, evidenceVerified: spec.verified ?? true, taxonomyVersion: "t", promptVersion: "p", createdAt: "2026-09-30T10:00:00.000Z",
  };
  return { item, analysis };
}

export function inputOf(specs: VideoSpec[], over: Partial<AnatomyInput> = {}): AnatomyInput {
  const made = specs.map(video);
  return {
    workspaceId: "w", own: [OWN], competitors: [RIVAL], now: NOW,
    items: made.map((m) => m.item),
    analyses: made.flatMap((m) => (m.analysis ? [m.analysis] : [])),
    ...over,
  };
}
