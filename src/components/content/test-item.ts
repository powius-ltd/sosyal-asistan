/** Yalnız testler için: en az alanla `ContentItem` üretir (mock depoya bağımlı olmadan). */
import type { ContentItem } from "@/lib/domain/content";

export function testItem(overrides: Partial<ContentItem> & { id: string }): ContentItem {
  return {
    workspaceId: "ws_test",
    platform: "instagram",
    externalId: `ext_${overrides.id}`,
    owner: { kind: "own", id: "oa_test", handle: "bahcekafe.ist" },
    format: "short_video",
    hashtags: [],
    missingFields: [],
    metrics: { extra: {} },
    score: { lowConfidence: false, immature: false },
    hasTranscript: false,
    firstSeenAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}
