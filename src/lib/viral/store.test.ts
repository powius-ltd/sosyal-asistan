import { describe, expect, it } from "vitest";

import type { ViralItem } from "@/lib/viral/select";
import { toViralRow } from "@/lib/viral/store";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("toViralRow", () => {
  const item: ViralItem = {
    platform: "tiktok",
    externalId: "7300000000000000001",
    url: "https://www.tiktok.com/@yazar/video/7300000000000000001",
    authorHandle: "yazar",
    authorFollowers: 1_000,
    views: 50_000,
    viewsKind: "tt_play_count",
    publishedAt: "2026-11-18T10:00:00Z",
    hashtags: ["kahve"],
    query: "kahve",
    viewsPerFollower: 50,
  };
  it("yalnız izin listesindeki sütunlar; olmayan sayılar null (0 değil)", () => {
    const row = toViralRow("ws", item, NOW);
    expect(row).toMatchObject({ workspace_id: "ws", views_per_follower: 50, likes: null, shares: null, duration_sec: null, caption: null });
    expect(Object.keys(row).sort()).toEqual(
      [
        "workspace_id", "platform", "external_id", "author_handle", "author_followers", "views", "views_kind", "likes", "comments", "shares",
        "views_per_follower", "published_at", "duration_sec", "caption", "hashtags", "content_url", "query", "found_at", "refreshed_at",
      ].sort(),
    );
  });
});
