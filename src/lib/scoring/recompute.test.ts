import { describe, expect, it } from "vitest";

import { recomputeAccountScores } from "@/lib/scoring/recompute";
import { recomputeWorkspaceScores } from "@/lib/scoring/recompute-workspace";
import { COMPETITOR, contentRow, metricsRow, NOW, WS } from "@/lib/scoring/test-fixtures";
import type {
  ContentScoringRow,
  LatestMetricsRow,
  ScoreWriteRow,
  ScoringOwner,
  ScoringStore,
} from "@/lib/scoring/types";

const OWN = "00000000-0000-4000-8000-00000000dddd";
const RIVAL: ScoringOwner = { kind: "competitor", id: COMPETITOR };
const MINE: ScoringOwner = { kind: "own", id: OWN };

interface FakeData {
  owners?: ScoringOwner[];
  content?: Record<string, ContentScoringRow[]>;
  metrics?: LatestMetricsRow[];
  followers?: Record<string, number>;
  failOn?: string;
}

/** Bellekte depo: çağrıları kaydeder (N+1 denetimi) ve yazılanları saklar. */
function fakeStore(data: FakeData) {
  const calls: string[] = [];
  const written: ScoreWriteRow[][] = [];
  const store: ScoringStore = {
    async listOwners() {
      calls.push("listOwners");
      return data.owners ?? [];
    },
    async listOwnerContent(_ws, owner) {
      calls.push(`listOwnerContent:${owner.id}`);
      if (data.failOn === owner.id) throw new Error("okuma bozuk");
      return data.content?.[owner.id] ?? [];
    },
    async latestMetrics(_ws, ids) {
      calls.push(`latestMetrics:${ids.length}`);
      return new Map((data.metrics ?? []).filter((m) => ids.includes(m.content_item_id as string)).map((m) => [m.content_item_id as string, m]));
    },
    async latestFollowers(_ws, owner) {
      calls.push(`latestFollowers:${owner.id}`);
      return data.followers?.[owner.id];
    },
    async writeScores(rows) {
      calls.push(`writeScores:${rows.length}`);
      written.push([...rows]);
    },
  };
  return { store, calls, written };
}

const RIVAL_ROWS = Array.from({ length: 12 }, (_, i) => contentRow(`r${i}`, i + 4));
const RIVAL_METRICS = RIVAL_ROWS.map((row, i) => metricsRow(row.id, i === 0 ? 5000 : 1000));
const OWN_ROWS = [contentRow("o1", 5, { competitor_id: null, social_account_id: OWN })];

describe("recomputeAccountScores", () => {
  it("içerik + metrik + takipçi TEK seferde okunur, skorlar TEK toplu yazımla yazılır (N+1 yok)", async () => {
    const { store, calls, written } = fakeStore({
      content: { [COMPETITOR]: RIVAL_ROWS },
      metrics: RIVAL_METRICS,
      followers: { [COMPETITOR]: 10_000 },
    });
    const result = await recomputeAccountScores(WS, RIVAL, NOW, { store });

    expect(result).toEqual({ owner: RIVAL, items: 12, followers: 10_000 });
    expect(calls.sort()).toEqual(
      [`listOwnerContent:${COMPETITOR}`, "latestMetrics:12", `latestFollowers:${COMPETITOR}`, "writeScores:12"].sort(),
    );
    const top = written[0].find((row) => row.id === "r0");
    expect(top).toMatchObject({ lift: 5, lift_tier: 4, baseline_views: 1000, baseline_n: 11, scored_at: NOW.toISOString() });
    expect(top?.cross_score).toBeCloseTo(Math.log(0.5) * Math.log(10_000), 12);
  });

  it("içeriği olmayan sahip: metrik okunmaz, yazım yapılmaz", async () => {
    const { store, calls } = fakeStore({});
    await expect(recomputeAccountScores(WS, RIVAL, NOW, { store })).resolves.toEqual({ owner: RIVAL, items: 0 });
    expect(calls).toEqual([`listOwnerContent:${COMPETITOR}`]);
  });

  it("takipçi yoksa cross_score NULL; sonuçta followers undefined", async () => {
    const { store, written } = fakeStore({ content: { [COMPETITOR]: RIVAL_ROWS }, metrics: RIVAL_METRICS });
    const result = await recomputeAccountScores(WS, RIVAL, NOW, { store });
    expect(result.followers).toBeUndefined();
    expect(written[0].every((row) => row.cross_score === null)).toBe(true);
  });

  it("ikinci çalıştırma aynı satırları yazar (idempotent)", async () => {
    const { store, written } = fakeStore({
      content: { [COMPETITOR]: RIVAL_ROWS },
      metrics: RIVAL_METRICS,
      followers: { [COMPETITOR]: 10_000 },
    });
    await recomputeAccountScores(WS, RIVAL, NOW, { store });
    await recomputeAccountScores(WS, RIVAL, NOW, { store });
    expect(written[1]).toEqual(written[0]);
  });

  it("geçersiz now reddedilir (DB'ye dokunmadan)", async () => {
    const { store, calls } = fakeStore({});
    await expect(recomputeAccountScores(WS, RIVAL, new Date("x"), { store })).rejects.toThrow(RangeError);
    expect(calls).toEqual([]);
  });
});

describe("recomputeWorkspaceScores", () => {
  it("tüm sahipleri sırayla skorlar; bir sahibin hatası diğerlerini durdurmaz", async () => {
    const broken: ScoringOwner = { kind: "competitor", id: "bozuk" };
    const { store, written } = fakeStore({
      owners: [MINE, broken, RIVAL],
      content: { [OWN]: OWN_ROWS, [COMPETITOR]: RIVAL_ROWS },
      metrics: [...RIVAL_METRICS, metricsRow("o1", 300, "ig_views")],
      failOn: "bozuk",
    });
    const result = await recomputeWorkspaceScores(WS, NOW, { store });

    expect(result.owners.map((o) => [o.owner.id, o.items])).toEqual([
      [OWN, 1],
      [COMPETITOR, 12],
    ]);
    expect(result.items).toBe(13);
    expect(result.failures).toEqual([{ owner: broken, message: "okuma bozuk" }]);
    expect(written.map((rows) => rows.length)).toEqual([1, 12]);
  });

  it("sahip yoksa boş sonuç", async () => {
    const { store } = fakeStore({});
    await expect(recomputeWorkspaceScores(WS, NOW, { store })).resolves.toEqual({ owners: [], failures: [], items: 0 });
  });
});
