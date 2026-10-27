import { describe, expect, it, vi } from "vitest";
import { video } from "@/lib/anatomy/test-fixtures";
import { loadProvenIdeas, type ProvenIdeasReaders } from "@/lib/intel/proven-ideas-load";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function fakeReaders() {
  const a = video({ id: "a", lift: 3.5 });
  const b = video({ id: "b", lift: 4 });
  b.item.owner = { kind: "competitor", id: "r2", handle: "r2" };
  const readers = {
    readContent: vi.fn(async () => [a.item, b.item]),
    readAnalyses: vi.fn(async () => [a.analysis!, b.analysis!].map((x) => ({ ...x, hookType: "question" }))),
    readClusters: vi.fn(async () => ["a", "b"].map((id) => ({ contentItemId: id, clusterKey: "kahve", clusterLabel: "Kahve", clusteredAt: "2026-09-30T00:00:00.000Z" }))),
    readOffNicheIds: vi.fn(async () => []),
  } satisfies ProvenIdeasReaders;
  return readers;
}

describe("loadProvenIdeas", () => {
  it("her kaynağı tam bir kez okur (N+1 yok) ve kart kurar", async () => {
    const readers = fakeReaders();
    const result = await loadProvenIdeas(readers, { now: NOW });
    for (const fn of Object.values(readers)) expect(fn).toHaveBeenCalledTimes(1);
    expect(readers.readContent).toHaveBeenCalledWith("2026-07-02T12:00:00.000Z");
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas[0].kind).toBe("proven");
    expect(result.counts).toEqual({ items: 2, analyses: 2, clusters: 2, offNiche: 0 });
  });
});
