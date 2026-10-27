import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearStarterSignalsCache, loadStarterSignals, SIGNALS_TTL_MS } from "@/lib/agents/chat/starter-signals";
import type { PanelRepository } from "@/lib/data/repository";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function fakeRepo(over: Record<string, unknown> = {}) {
  const repo = {
    listWeeklyPlans: vi.fn().mockResolvedValue([{ id: "p" }]),
    listContent: vi.fn().mockResolvedValue({ items: [{ id: "c", publishedAt: "2026-09-29T10:00:00.000Z" }] }),
    getTopicHookMatrix: vi.fn().mockResolvedValue({ winners: [{ k: 1 }] }),
    getCreativeMatrix: vi.fn().mockResolvedValue({ opportunities: [{ k: 1 }] }),
    ...over,
  };
  return repo as unknown as PanelRepository & typeof repo;
}

beforeEach(() => clearStarterSignalsCache());

describe("loadStarterSignals (D3-11)", () => {
  it("beş okumadan sinyalleri çıkarır; kendi tutanlar 90 gün penceresi ve olgunlaşmış filtresiyle sorulur", async () => {
    const repo = fakeRepo();
    const signals = await loadStarterSignals(repo, "ws1", "mixed", NOW);
    expect(signals).toEqual({ hasPlan: true, hasOwnBest: true, hasLatest: true, hasTopicWinners: true, hasAngleOpportunity: true });
    expect(repo.listContent).toHaveBeenCalledWith("ws1", expect.objectContaining({ ownerKind: "own", sort: "recent", limit: 1 }));
    expect(repo.listContent).toHaveBeenCalledWith("ws1", expect.objectContaining({ ownerKind: "own", minTier: 3, hideImmature: true, since: "2026-07-02T12:00:00.000Z", limit: 1 }));
  });

  it("boş okumalar false; okunamayan sinyal de false (hata fırlatmaz)", async () => {
    const repo = fakeRepo({
      listWeeklyPlans: vi.fn().mockResolvedValue([]),
      listContent: vi.fn().mockRejectedValue(new Error("db")),
      getTopicHookMatrix: vi.fn().mockResolvedValue({ winners: [] }),
      getCreativeMatrix: vi.fn().mockRejectedValue(new Error("db")),
    });
    expect(await loadStarterSignals(repo, "ws1", "mixed", NOW)).toEqual({ hasPlan: false, hasOwnBest: false, hasLatest: false, hasTopicWinners: false, hasAngleOpportunity: false });
  });

  it("en son videonun yayın tarihi yoksa ya da gelecekteyse 'son video' sinyali false", async () => {
    for (const publishedAt of [undefined, "2026-10-05T00:00:00.000Z"]) {
      clearStarterSignalsCache();
      const repo = fakeRepo({ listContent: vi.fn().mockResolvedValue({ items: [{ id: "c", publishedAt }] }) });
      expect((await loadStarterSignals(repo, "ws1", "mixed", NOW)).hasLatest).toBe(false);
    }
  });

  it("türün kullanmadığı matris okunmaz", async () => {
    const repo = fakeRepo();
    await loadStarterSignals(repo, "ws1", "creator", NOW);
    expect(repo.getCreativeMatrix).not.toHaveBeenCalled();
    expect(repo.getTopicHookMatrix).toHaveBeenCalled();
  });

  it("sonuç çalışma alanı başına kısa süre hatırlanır; süre dolunca yeniden okunur", async () => {
    const repo = fakeRepo();
    await loadStarterSignals(repo, "ws1", "business", NOW);
    await loadStarterSignals(repo, "ws1", "business", new Date(NOW.getTime() + SIGNALS_TTL_MS - 1));
    expect(repo.listWeeklyPlans).toHaveBeenCalledTimes(1);
    await loadStarterSignals(repo, "ws1", "business", new Date(NOW.getTime() + SIGNALS_TTL_MS));
    expect(repo.listWeeklyPlans).toHaveBeenCalledTimes(2);
    await loadStarterSignals(repo, "ws2", "business", NOW);
    expect(repo.listWeeklyPlans).toHaveBeenCalledTimes(3);
  });
});
