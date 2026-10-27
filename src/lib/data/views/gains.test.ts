import { describe, expect, it } from "vitest";

import type { OwnAccount } from "@/lib/domain/competitor";
import type { AccountSnapshot, ContentItem, MetricSnapshot } from "@/lib/domain/content";
import { followersAt, gainedViews } from "@/lib/data/views/gains";
import { DAY_MS } from "@/lib/time";

const T0 = Date.parse("2026-09-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const item = (id: string, publishedAt: number | undefined) => ({ id, publishedAt: publishedAt === undefined ? undefined : iso(publishedAt) }) as ContentItem;
const snap = (contentItemId: string, at: number, views: number | undefined) => ({ id: `${contentItemId}-${at}`, contentItemId, capturedAt: iso(at), views }) as MetricSnapshot;

describe("gainedViews", () => {
  const snaps = new Map<string, MetricSnapshot[]>([["a", [snap("a", T0 + DAY_MS, 100), snap("a", T0 + 3 * DAY_MS, 300)]]]);

  it("aralıkta kazanılan izlenme: yayından önce 0, snapshot'lar arası doğrusal ara değer, son ölçümden sonra düz", () => {
    const items = [item("a", T0)];
    expect(gainedViews(snaps, items, T0, T0 + 3 * DAY_MS)).toBe(300);
    expect(gainedViews(snaps, items, T0 + DAY_MS, T0 + 2 * DAY_MS)).toBe(100);
    expect(gainedViews(snaps, items, T0 + 3 * DAY_MS, T0 + 9 * DAY_MS), "son ölçümden sonra kazanç yok ama ölçülmüş: 0").toBe(0);
    expect(gainedViews(snaps, items, T0 - 5 * DAY_MS, T0 - DAY_MS), "yayından önce: 0").toBe(0);
  });

  it("izlenmesi hiç ölçülmemiş ya da tarihsiz içerik sayılmaz; hiçbiri ölçülmediyse undefined (0 değil)", () => {
    const unmeasured = new Map<string, MetricSnapshot[]>([["b", [snap("b", T0 + DAY_MS, undefined)]]]);
    expect(gainedViews(unmeasured, [item("b", T0)], T0, T0 + 2 * DAY_MS)).toBeUndefined();
    expect(gainedViews(snaps, [item("a", undefined)], T0, T0 + 2 * DAY_MS)).toBeUndefined();
    expect(gainedViews(snaps, [], T0, T0 + DAY_MS)).toBeUndefined();
    // Ölçülmüş bir içerik varsa ölçülmeyen toplamı bozmaz.
    expect(gainedViews(new Map([...snaps, ...unmeasured]), [item("a", T0), item("b", T0)], T0, T0 + 3 * DAY_MS)).toBe(300);
  });
});

describe("followersAt", () => {
  const own = [{ id: "o1" }, { id: "o2" }] as OwnAccount[];
  const at = (subjectId: string, ms: number, followers: number | undefined) =>
    ({ id: `${subjectId}-${ms}`, subjectKind: "own", subjectId, capturedAt: iso(ms), followers, extra: {} }) as AccountSnapshot;

  it("her hesabın t anındaki (ya da öncesindeki) son ölçümünün toplamı", () => {
    const series = [at("o1", T0, 100), at("o1", T0 + 2 * DAY_MS, 150), at("o2", T0, 10), at("o2", T0 + 5 * DAY_MS, 99)];
    expect(followersAt(series, own, T0 + DAY_MS)).toBe(110);
    expect(followersAt(series, own, T0 + 3 * DAY_MS)).toBe(160);
    expect(followersAt(series, own, T0 + 9 * DAY_MS)).toBe(249);
  });

  it("bir hesabın o ana kadar ölçümü yoksa ya da hesap yoksa undefined (0 değil)", () => {
    const series = [at("o1", T0, 100), at("o2", T0 + 4 * DAY_MS, 10), at("o1", T0 + DAY_MS, undefined)];
    expect(followersAt(series, own, T0 + DAY_MS)).toBeUndefined();
    expect(followersAt(series, [], T0 + DAY_MS)).toBeUndefined();
  });
});
