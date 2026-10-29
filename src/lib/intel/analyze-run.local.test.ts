/**
 * `runAnalysis` yerel video yolu: yerel dosyası olan kendi video Apify adresi aranmadan `analyzeLocal` ile incelenir; kalanlar eski yoldan.
 * DB / LLM / video aracı SAHTEDİR (modül taklidi); seçim ve kuyruk gerçek koddur.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { runAnalysis } from "@/lib/intel/analyze-run";
import type { AnalyzeArgs } from "@/lib/intel/args";
import type { IntelContext } from "@/lib/intel/context";

const analyze = vi.hoisted(() => vi.fn());
const analyzeLocal = vi.hoisted(() => vi.fn());
const saveAnalysis = vi.hoisted(() => vi.fn(async () => undefined));
const localFiles = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("@/lib/intel/housekeeping", () => ({ runHousekeeping: vi.fn(async () => undefined) }));
vi.mock("@/lib/intel/content-load", () => ({ loadAllContent: vi.fn(), loadScreens: vi.fn(async () => new Map()), loadTranscripts: vi.fn(async () => new Map()) }));
vi.mock("@/lib/intel/local-video-source", () => ({ resolveLocalVideos: vi.fn(async () => ({ files: localFiles.files, notes: [] })) }));
vi.mock("@/lib/intel/video-source", () => ({
  resolveVideoUrls: vi.fn(async (_c: unknown, _w: unknown, needs: { contentId: string }[]) => ({
    urls: new Map(needs.filter((n) => n.contentId !== "yok").map((n) => [n.contentId, `https://video.test/${n.contentId}`])),
    notes: [],
  })),
  partitionVideos: vi.fn((items: readonly { id: string }[], urls: ReadonlyMap<string, string>) => ({
    ready: items.filter((i) => urls.has(i.id)).map((item) => ({ item, url: urls.get(item.id) as string })),
    expired: [],
    missing: items.filter((i) => !urls.has(i.id)),
  })),
  mustRecollect: vi.fn((p: { ready: unknown[]; missing: unknown[] }) => p.ready.length === 0 && p.missing.length > 0),
}));
vi.mock("@/lib/intel/analysis-store", () => ({ saveAnalysis }));
vi.mock("@/lib/intel/run-log", () => ({ openSubscriptionRun: vi.fn(async () => ({ id: "run" })), closeRun: vi.fn(async () => undefined) }));
vi.mock("@/lib/video-analysis", () => ({
  createVideoAnalyzer: () => ({ backend: "sahte", model: "sahte-model", checkAvailable: async () => ({ available: true }), analyze, analyzeLocal }),
  sweepStaleTempDirs: () => ({ removed: 0, failed: 0 }),
}));

const { loadAllContent } = await import("@/lib/intel/content-load");
const { resolveLocalVideos } = await import("@/lib/intel/local-video-source");
const { resolveVideoUrls } = await import("@/lib/intel/video-source");

const item = (id: string, kind: "own" | "rival"): ContentItem =>
  ({
    id,
    externalId: `ext-${id}`,
    shortcode: `kod-${id}`,
    platform: "instagram",
    owner: { kind, id: kind === "own" ? "hesap" : "rv", handle: kind === "own" ? "test.hesap" : "rakip" },
    score: {},
    publishedAt: "2026-10-01T10:00:00.000Z",
  }) as unknown as ContentItem;

const ctx = { client: {}, repo: { listCompetitors: async () => [{ id: "rv" }] }, workspaceId: "ws", workspaceSlug: "hesap", workspace: {}, now: new Date("2026-10-05T09:00:00.000Z") } as unknown as IntelContext;
const okResult = (contentId: string) => ({ contentId, status: "ok", evidenceVerified: true, analysis: {}, stats: { calls: 1, totalTokens: 10, durationMs: 5 } });
const args: AnalyzeArgs = { pilot: false, limit: 19, dryRun: false, concurrency: 1 };

beforeEach(() => {
  analyze.mockReset().mockImplementation(async (input: { contentId: string }) => okResult(input.contentId));
  analyzeLocal.mockReset().mockImplementation(async (input: { contentId: string }) => okResult(input.contentId));
  saveAnalysis.mockClear();
  localFiles.files = new Map();
});

describe("runAnalysis yerel video", () => {
  it("yerel + Apify karışık seçim: yerel olan dosyadan, kalanlar adresten incelenir; log yerel sayısını yazar", async () => {
    vi.mocked(loadAllContent).mockResolvedValue([item("a", "own"), item("b", "own"), item("r", "rival")]);
    localFiles.files = new Map([["a", "/disk/final.mp4"]]);
    const lines: string[] = [];
    const summary = await runAnalysis(ctx, args, (line) => lines.push(line));
    expect(summary).toMatchObject({ outcome: "completed", selected: 3, ok: 3, failed: 0 });
    expect(analyzeLocal).toHaveBeenCalledTimes(1);
    expect(analyzeLocal).toHaveBeenCalledWith(expect.objectContaining({ contentId: "a", isCompetitor: false }), "/disk/final.mp4");
    expect(analyze.mock.calls.map(([input]) => input.contentId).sort()).toEqual(["b", "r"]);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ contentId: "r", isCompetitor: true, videoUrl: "https://video.test/r" }));
    expect(lines.some((l) => l.includes("3 hazır (1 yerel dosyadan)"))).toBe(true);
    // Apify adresi yalnız yerel olmayanlar için aranır
    expect(vi.mocked(resolveVideoUrls).mock.calls.at(-1)?.[2].map((n) => n.contentId).sort()).toEqual(["b", "r"]);
  });

  it("rakip içerik yerel eşlemeye isOwn=false ile gider", async () => {
    vi.mocked(loadAllContent).mockResolvedValue([item("a", "own"), item("r", "rival")]);
    await runAnalysis(ctx, args, () => undefined);
    const refs = vi.mocked(resolveLocalVideos).mock.calls.at(-1)?.[2] ?? [];
    expect(refs.map((r) => [r.id, r.isOwn])).toEqual(expect.arrayContaining([["a", true], ["r", false]]));
  });

  it("yerel dosyası olan içerik adresi hiç bulunmasa da needs_recollect / invalid_url'e düşmez", async () => {
    vi.mocked(loadAllContent).mockResolvedValue([item("yok", "own")]);
    localFiles.files = new Map([["yok", "/disk/final.mp4"]]);
    const summary = await runAnalysis(ctx, args, () => undefined);
    expect(summary).toMatchObject({ outcome: "completed", ok: 1, failed: 0, missing: 0 });
    expect(analyze).not.toHaveBeenCalled();
    expect(saveAnalysis).toHaveBeenCalledTimes(1);
  });

  it("yerel yoksa eski davranış: adresi olmayan tek video needs_recollect", async () => {
    vi.mocked(loadAllContent).mockResolvedValue([item("yok", "own")]);
    const summary = await runAnalysis(ctx, args, () => undefined);
    expect(summary.outcome).toBe("needs_recollect");
    expect(analyzeLocal).not.toHaveBeenCalled();
  });
});
