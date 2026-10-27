/**
 * `runAnalysis` token kaydı (koşu satırına giriş/çıkış token'ı) ve isteğe bağlı kancaları (`shouldStop`, `onProgress`; panel işçisi kullanır): sayaç ve videolar arası durdurma. DB / LLM /
 * video aracı SAHTEDİR (modül taklidi); seçim ve kuyruk gerçek koddur. Kanca verilmediğinde davranış değişmez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { runAnalysis } from "@/lib/intel/analyze-run";
import type { AnalyzeArgs } from "@/lib/intel/args";
import type { IntelContext } from "@/lib/intel/context";

const analyze = vi.hoisted(() => vi.fn());
const saveAnalysis = vi.hoisted(() => vi.fn(async () => undefined));
const closeRun = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined));

vi.mock("@/lib/intel/housekeeping", () => ({ runHousekeeping: vi.fn(async () => undefined) }));
vi.mock("@/lib/intel/content-load", () => ({ loadAllContent: vi.fn(), loadScreens: vi.fn(async () => new Map()), loadTranscripts: vi.fn(async () => new Map()) }));
vi.mock("@/lib/intel/video-source", () => ({
  resolveVideoUrls: vi.fn(async () => ({ urls: new Map(), notes: [] })),
  partitionVideos: vi.fn((items: readonly { id: string }[]) => ({ ready: items.map((item) => ({ item, url: `https://video.test/${item.id}` })), expired: [], missing: [] })),
  mustRecollect: vi.fn(() => false),
}));
vi.mock("@/lib/intel/analysis-store", () => ({ saveAnalysis }));
vi.mock("@/lib/intel/run-log", () => ({ openSubscriptionRun: vi.fn(async () => ({ id: "run" })), closeRun }));
vi.mock("@/lib/video-analysis", () => ({
  createVideoAnalyzer: () => ({ backend: "sahte", model: "sahte-model", checkAvailable: async () => ({ available: true }), analyze }),
  sweepStaleTempDirs: () => ({ removed: 0, failed: 0 }),
}));

const { loadAllContent } = await import("@/lib/intel/content-load");

const item = (n: number): ContentItem =>
  ({ id: `icerik-${n}`, externalId: `ext-${n}`, shortcode: `kod${n}`, platform: "instagram", owner: { kind: "own", id: "hesap", handle: "test.hesap" }, score: {}, publishedAt: `2026-10-0${n}T10:00:00.000Z` }) as unknown as ContentItem;

const ctx = { client: {}, repo: { listCompetitors: async () => [] }, workspaceId: "ws", workspace: {}, now: new Date("2026-10-05T09:00:00.000Z") } as unknown as IntelContext;
const okResult = (contentId: string) => ({ contentId, status: "ok", evidenceVerified: true, analysis: {}, stats: { calls: 1, totalTokens: 10, durationMs: 5 } });
const args = (extra: Partial<AnalyzeArgs> = {}): AnalyzeArgs => ({ pilot: false, limit: 19, dryRun: false, concurrency: 1, ...extra });

beforeEach(() => {
  analyze.mockReset().mockImplementation(async (input: { contentId: string }) => okResult(input.contentId));
  saveAnalysis.mockClear();
  closeRun.mockClear();
  vi.mocked(loadAllContent).mockResolvedValue([1, 2, 3, 4, 5].map(item));
});

describe("runAnalysis kancaları", () => {
  it("kanca verilmezse davranış değişmez: seçilen bütün videolar incelenir", async () => {
    const summary = await runAnalysis(ctx, args(), () => undefined);
    expect(analyze).toHaveBeenCalledTimes(5);
    expect(summary).toMatchObject({ outcome: "completed", selected: 5, ok: 5, skippedByCap: 0 });
  });

  it("onProgress: kuyruk başında 0/n, her video bitince i/n", async () => {
    const seen: string[] = [];
    await runAnalysis(ctx, args({ onProgress: ({ done, total }) => void seen.push(`${done}/${total}`) }), () => undefined);
    expect(seen).toEqual(["0/5", "1/5", "2/5", "3/5", "4/5", "5/5"]);
  });

  it("shouldStop true dönünce YENİ video başlamaz; yapılanlar yazılı kalır, kalanlar atlanmış sayılır", async () => {
    let finished = 0;
    const log: string[] = [];
    const summary = await runAnalysis(ctx, args({ onProgress: ({ done }) => void (finished = done), shouldStop: () => finished >= 2 }), (line) => log.push(line));
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(saveAnalysis).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ outcome: "completed", selected: 5, ok: 2, skippedByCap: 3 });
    expect(log.filter((line) => line.includes("Durdurma istendi"))).toHaveLength(1);
  });

  it("eşzamanlı incelemede durdurma: yolda olan video biter, sıradaki başlamaz", async () => {
    const release: Record<string, () => void> = {};
    analyze.mockImplementation((input: { contentId: string }) => new Promise((resolve) => (release[input.contentId] = () => resolve(okResult(input.contentId)))));
    let stop = false;
    const running = runAnalysis(ctx, args({ concurrency: 2, shouldStop: () => stop }), () => undefined);
    await vi.waitFor(() => expect(Object.keys(release)).toHaveLength(2));
    const [first, second] = Object.keys(release);
    stop = true; // iki video yoldayken durdurma istenir
    release[first]();
    await vi.waitFor(() => expect(saveAnalysis).toHaveBeenCalledTimes(1));
    release[second]();
    const summary = await running;
    expect(analyze, "durdurmadan sonra üçüncü video başlamadı").toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ ok: 2, skippedByCap: 3 });
  });

  it("kuyruk başlamadan durdurma istenmişse hiçbir video başlamaz", async () => {
    const summary = await runAnalysis(ctx, args({ shouldStop: async () => true }), () => undefined);
    expect(analyze).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ outcome: "completed", ok: 0, skippedByCap: 5 });
  });

  it("kanca hatası analizi düşürmez", async () => {
    const boom = () => {
      throw new Error("satır yazılamadı");
    };
    const summary = await runAnalysis(ctx, args({ onProgress: boom, shouldStop: boom }), () => undefined);
    expect(summary).toMatchObject({ ok: 5, skippedByCap: 0 });
  });

  it("sayaç kancası düşse de durdurma sorulur", async () => {
    const boom = () => {
      throw new Error("satır yazılamadı");
    };
    const summary = await runAnalysis(ctx, args({ onProgress: boom, shouldStop: () => analyze.mock.calls.length >= 1 }), () => undefined);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ ok: 1, skippedByCap: 4 });
  });
});

describe("runAnalysis token kaydı (abonelik koşusunun gölge maliyeti için)", () => {
  it("video başına giriş/çıkış token'ı koşu satırına yazılır", async () => {
    analyze.mockImplementation(async (input: { contentId: string }) => ({ ...okResult(input.contentId), stats: { calls: 2, inputTokens: 61016, outputTokens: 46560, totalTokens: 107576, durationMs: 5 } }));
    vi.mocked(loadAllContent).mockResolvedValue([item(1)]);
    await runAnalysis(ctx, args(), () => undefined);
    expect(closeRun).toHaveBeenCalledWith(expect.anything(), "run", expect.objectContaining({ ok: true, inputTokens: 61016, outputTokens: 46560 }));
  });

  it("zarf token bildirmediyse alanlar tanımsız kalır (0 yazılmaz)", async () => {
    vi.mocked(loadAllContent).mockResolvedValue([item(1)]);
    await runAnalysis(ctx, args(), () => undefined);
    const close = closeRun.mock.calls[0][2] as { inputTokens?: number; outputTokens?: number };
    expect([close.inputTokens, close.outputTokens]).toEqual([undefined, undefined]);
  });
});
