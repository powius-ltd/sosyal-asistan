import { describe, expect, it } from "vitest";

import { buildCheckpoints, type SnapshotPoint } from "@/lib/outcomes/checkpoints";
import { buildMeasurementDue } from "@/lib/outcomes/due";
import type { OutcomeContent } from "@/lib/outcomes/content";
import { DAY_MS } from "@/lib/time";

const PUBLISHED = Date.parse("2026-09-01T12:00:00Z");
const at = (days: number) => new Date(PUBLISHED + days * DAY_MS).toISOString();
const snap = (days: number, views: number | undefined, extra: Partial<SnapshotPoint> = {}): SnapshotPoint => ({
  capturedAt: at(days),
  views,
  viewsKind: "ig_play_count",
  ...extra,
});
const build = (snapshots: SnapshotPoint[], nowDays: number, extra: Partial<Parameters<typeof buildCheckpoints>[0]> = {}) =>
  buildCheckpoints({ publishedAt: at(0), snapshots, now: new Date(PUBLISHED + nowDays * DAY_MS), baselineViews: 1000, baselineViewsKind: "ig_play_count", ...extra });
const byDay = (points: ReturnType<typeof build>, day: 1 | 3 | 7) => points.find((p) => p.day === day)!;

describe("kontrol noktası pencereleri (D+1 [1,2], D+3 [3,5], D+7 [7,10]; uçlar dahil)", () => {
  it("pencere sınırında ölçüm noktayı doldurur, bir an dışında doldurmaz", () => {
    const edges = build([snap(1, 100), snap(2, 200), snap(3, 300), snap(5, 500), snap(7, 700), snap(10, 1000)], 11);
    expect(edges.map((p) => p.views)).toEqual([100, 300, 700]); // pencerede İLK ölçüm

    const outside = build([snap(0.99, 50), snap(2.01, 60), snap(5.01, 70), snap(6.99, 80), snap(10.01, 90)], 11);
    expect(outside.map((p) => p.status)).toEqual(["missed", "missed", "missed"]);
  });

  it("zamanında ölçülmedi (missed) 0 DEĞİL: sayılar undefined", () => {
    const [d1] = build([], 20);
    expect(d1.status).toBe("missed");
    expect([d1.views, d1.viewsPerFollower, d1.lift, d1.liftTier]).toEqual([undefined, undefined, undefined, undefined]);
    expect(d1.reason).toMatch(/zamanında ölçülmedi/);
  });

  it("durumlar: upcoming → due → missed; ölçümü olan measured", () => {
    expect(build([], 0.5).map((p) => p.status)).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(build([], 1.5).map((p) => p.status)).toEqual(["due", "upcoming", "upcoming"]);
    expect(build([], 2.5).map((p) => p.status)).toEqual(["missed", "upcoming", "upcoming"]);
    expect(build([], 6).map((p) => p.status)).toEqual(["missed", "missed", "upcoming"]);
    expect(build([snap(1.2, 400)], 6).map((p) => p.status)).toEqual(["measured", "missed", "upcoming"]);
  });

  it("izlenmesi ölçülememiş (views undefined) anlık görüntü noktayı doldurmaz", () => {
    expect(build([snap(1.5, undefined)], 1.8)[0].status).toBe("due");
  });

  it("yayın tarihi bilinmiyorsa nokta kurulmaz (boş liste)", () => {
    expect(buildCheckpoints({ publishedAt: undefined, snapshots: [snap(1, 5)], now: new Date(PUBLISHED) })).toEqual([]);
    expect(buildCheckpoints({ publishedAt: "bozuk", snapshots: [], now: new Date(PUBLISHED) })).toEqual([]);
  });
});

describe("lift yalnız D+7'de", () => {
  const all = build([snap(1.5, 4000), snap(4, 6000), snap(8, 2500)], 12);

  it("D+1/D+3'te views var, lift/kademe YOK; D+7'de lift = views / baz çizgisi", () => {
    for (const day of [1, 3] as const) {
      const point = byDay(all, day);
      expect(point.status).toBe("measured");
      expect(point.views).toBeGreaterThan(0);
      expect([point.lift, point.liftTier]).toEqual([undefined, undefined]);
    }
    const d7 = byDay(all, 7);
    expect(d7.lift).toBe(2.5);
    expect(d7.liftTier).toBe(2);
  });

  it("baz çizgisi yok ya da farklı views türü → D+7 lift undefined + sebep (0 değil)", () => {
    const noBaseline = byDay(build([snap(8, 2500)], 12, { baselineViews: undefined }), 7);
    expect([noBaseline.status, noBaseline.views, noBaseline.lift, noBaseline.liftTier]).toEqual(["measured", 2500, undefined, undefined]);
    expect(noBaseline.reason).toMatch(/baz çizgisi yok/);

    const otherKind = byDay(build([snap(8, 2500, { viewsKind: "ig_view_count" })], 12), 7);
    expect(otherKind.lift).toBeUndefined();
    expect(otherKind.reason).toMatch(/izlenme türü/);
  });

  it("izlenme/takipçi: ölçümdeki takipçi, yoksa yedek; ikisi de yoksa undefined + sebep", () => {
    const own = byDay(build([snap(1.5, 500, { ownerFollowers: 1000 })], 3, { followers: 9999 }), 1);
    expect(own.viewsPerFollower).toBe(0.5);
    const fallback = byDay(build([snap(1.5, 500)], 3, { followers: 2000 }), 1);
    expect(fallback.viewsPerFollower).toBe(0.25);
    const none = byDay(build([snap(1.5, 500)], 3), 1);
    expect(none.viewsPerFollower).toBeUndefined();
    expect(none.reason).toMatch(/takipçi/);
  });
});

describe("ölçüm zamanı geldi (due)", () => {
  const reel = (id: string, publishedDaysAgo: number, snapshots: SnapshotPoint[] = []): OutcomeContent => ({
    id,
    ownerHandle: "ornek",
    publishedAt: new Date(PUBLISHED - publishedDaysAgo * DAY_MS).toISOString(),
    snapshots,
  });

  it("yalnız penceresi açık ve ölçümü olmayan Reels listelenir; eskiden yeniye; içerik başına tek nokta", () => {
    const due = buildMeasurementDue(
      [
        reel("b-d3", 3.5), // D+3 penceresi açık
        reel("a-d1", 1.5), // D+1 açık
        reel("c-measured", 1.5, [snap(-0.2, 100)]), // ölçüm yayından sonra D+1 penceresinde
        reel("d-upcoming", 0.2),
        reel("e-old", 30),
      ],
      new Date(PUBLISHED),
    );
    expect(due.map((d) => [d.contentItemId, d.day])).toEqual([["b-d3", 3], ["a-d1", 1]]);
  });

  it("yayın tarihi bilinmeyen Reels listelenmez", () => {
    expect(buildMeasurementDue([{ id: "x", ownerHandle: "a", snapshots: [] }], new Date(PUBLISHED))).toEqual([]);
  });
});
