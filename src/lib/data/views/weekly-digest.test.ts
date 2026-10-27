import { describe, expect, it } from "vitest";

import { OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { filterOutliers } from "@/lib/data/mock/mock-filters";
import { MOCK_NOW } from "@/lib/data/mock/mock-clock";
import { createMockContext } from "@/lib/data/mock/repos/context";
import { followersAt, gainedViews } from "@/lib/data/views/gains";
import { buildWeeklyDigest, DIGEST_DAYS, type DigestInput } from "@/lib/data/views/weekly-digest";
import { DAY_MS } from "@/lib/time";

const now = new Date(MOCK_NOW);
const start = now.getTime() - DIGEST_DAYS * DAY_MS;

function seeded(): DigestInput {
  const { state, snapshotsByItem } = createMockContext();
  return {
    own: state.ownAccounts,
    competitors: state.competitors,
    items: state.content,
    outliers: filterOutliers(state.content, { minTier: OUTLIER_MIN_TIER, sort: "lift" }, state.ownAccounts, state.competitors),
    snapshotsByItem,
    accountSnapshots: state.accountSnapshots,
    analyses: state.analyses,
    ideas: state.ideas,
  };
}

const EMPTY: DigestInput = {
  own: [],
  competitors: [],
  items: [],
  outliers: [],
  snapshotsByItem: new Map(),
  accountSnapshots: [],
  analyses: [],
  ideas: [],
};

describe("buildWeeklyDigest (paylaşılan görünüm)", () => {
  it("dönem = now'dan geriye 7 gün", () => {
    const digest = buildWeeklyDigest(seeded(), now);
    expect(digest.periodEnd).toBe(now.toISOString());
    expect(digest.periodStart).toBe(new Date(start).toISOString());
  });

  it("izlenme ve takipçi farkı Genel bakışın yardımcılarıyla aynı sayıyı verir (ekranlar çelişmez)", () => {
    const input = seeded();
    const digest = buildWeeklyDigest(input, now);
    const ownIds = new Set(input.own.map((a) => a.id));
    const ownItems = input.items.filter((c) => c.owner.kind === "own" && ownIds.has(c.owner.id));
    expect(digest.own.views).toBe(gainedViews(input.snapshotsByItem, ownItems, start, now.getTime()));

    const ownSnaps = input.accountSnapshots.filter((s) => s.subjectKind === "own" && ownIds.has(s.subjectId));
    const before = followersAt(ownSnaps, input.own, start);
    const after = followersAt(ownSnaps, input.own, now.getTime());
    expect(digest.own.followersDelta).toBe(before !== undefined && after !== undefined ? after - before : undefined);
  });

  it("yeni tutanlar çağıranın verdiği süzgeçten gelir: dönemde yayınlananlar, verilen sırayla, en çok 5", () => {
    const input = seeded();
    const digest = buildWeeklyDigest(input, now);
    const expected = input.outliers
      .filter((c) => c.publishedAt !== undefined && Date.parse(c.publishedAt) > start && Date.parse(c.publishedAt) <= now.getTime())
      .slice(0, 5)
      .map((c) => c.id);
    expect(digest.competitors.newOutliers.map((o) => o.contentItemId)).toEqual(expected);

    // Süzgeç boş verilirse özet kendi başına tutan uydurmaz.
    expect(buildWeeklyDigest({ ...input, outliers: [] }, now).competitors.newOutliers).toEqual([]);
  });

  it("veri yoksa ölçülemeyen alanlar undefined + sebep; sayaçlar gerçek 0", () => {
    const digest = buildWeeklyDigest(EMPTY, now);
    expect(digest.own).toEqual({ followersDelta: undefined, views: undefined, topContent: [] });
    expect(digest.competitors).toEqual({ newOutliers: [], mostActive: undefined });
    expect(digest.ideas).toEqual({ new: 0, scripted: 0 });
    expect(digest.unmeasuredReasons).toEqual({
      followersDelta: "Dönem başı ve sonu için takipçi ölçümü yok.",
      views: "Dönemde izlenmesi ölçülmüş kendi içerik yok.",
      mostActive: "Dönemde izlenen rakiplerden tarihli içerik gelmedi.",
    });
  });

  it("ölçülen alanın sebebi yoktur", () => {
    const digest = buildWeeklyDigest(seeded(), now);
    if (digest.own.views !== undefined) expect(digest.unmeasuredReasons.views).toBeUndefined();
    if (digest.competitors.mostActive) expect(digest.unmeasuredReasons.mostActive).toBeUndefined();
  });
});
