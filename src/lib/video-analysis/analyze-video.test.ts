import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { SubprocessError, type SubprocessOptions, type SubprocessResult } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { DAY_MS } from "@/lib/time";
import { analyzeVideo } from "@/lib/video-analysis/analyze-video";
import type { AnalyzeVideoDeps, AnalyzeVideoInput } from "@/lib/video-analysis/types";
import { agyEnvelope, cdnUrl, createFakeFetch, makeBaseDir, noSleep, NOW, validOutput, videoResponse } from "@/lib/video-analysis/test-support";
import { tempRootDir } from "@/lib/video-analysis/temp-dir";

const base = makeBaseDir();
afterAll(() => base.cleanup());
afterEach(() => vi.restoreAllMocks());

const INPUT: AnalyzeVideoInput = { contentId: "c-1", videoUrl: cdnUrl(), isCompetitor: true, caption: "Comment RENEW for the guide", durationSec: 9 };

/** Geçici klasör kökünde (hiçbir analiz klasörü) kalıntı var mı. */
function leftovers(): string[] {
  const root = tempRootDir(base.dir);
  return existsSync(root) ? readdirSync(root) : [];
}

type AgyHandler = (options: SubprocessOptions) => Partial<SubprocessResult>;

/** ffmpeg + agy'yi tek sahte çalıştırıcıda birleştirir; komuta göre yönlendirir. */
function fakeRunner(agy: AgyHandler, ffmpegOutBytes = 100) {
  return createFakeSubprocess((options) => {
    if (options.command.toLowerCase().includes("ffmpeg")) {
      writeFileSync(options.args?.[options.args.length - 1] as string, Buffer.alloc(ffmpegOutBytes, 1));
      return {};
    }
    return agy(options);
  });
}

const okAgy: AgyHandler = () => ({ stdout: agyEnvelope(validOutput()) });

function deps(overrides: Partial<AnalyzeVideoDeps> = {}): AnalyzeVideoDeps {
  return {
    now: () => NOW,
    fetch: createFakeFetch(() => videoResponse(1000)).fetch,
    runner: fakeRunner(okAgy).runner,
    sleep: noSleep,
    env: {},
    tempBaseDir: base.dir,
    ...overrides,
  };
}

describe("analyzeVideo — başarılı akış", () => {
  it("indir → agy → doğrula: ok + evidenceVerified; rakip transcript'i +90 gün; temp klasör silinir", async () => {
    const runner = fakeRunner((options) => {
      // agy çalışırken video izole klasörde hazırdır
      const cwd = options.cwd as string;
      expect(path.dirname(cwd)).toBe(tempRootDir(base.dir));
      expect(existsSync(path.join(cwd, "video.mp4"))).toBe(true);
      return { stdout: agyEnvelope(validOutput()) };
    });
    const result = await analyzeVideo(INPUT, deps({ runner: runner.runner }));

    expect(result.status).toBe("ok");
    expect(result.evidenceVerified).toBe(true);
    if (result.status !== "ok") throw new Error("ok bekleniyordu");
    expect(result).toMatchObject({ contentId: "c-1", backend: "agy", model: "gemini-3.8-flash-medium", durationSec: 9 });
    expect(result.transcript.expiresAt).toBe(new Date(NOW.getTime() + 90 * DAY_MS).toISOString());
    expect(result.stats).toMatchObject({ calls: 1, retries: 0, correctionTurns: 0 });
    expect(runner.calls).toHaveLength(1); // 18 MB altı: ffmpeg çağrılmadı
    expect(leftovers()).toEqual([]); // video diskte kalmadı
  });

  it("kendi içerikte transcript süresiz (expiresAt yok)", async () => {
    const result = await analyzeVideo({ ...INPUT, isCompetitor: false }, deps());
    expect(result.status === "ok" && result.transcript.expiresAt).toBeFalsy();
  });

  it("CDN adresi ve belirteci agy'ye, sonuca ve günlüğe GİTMEZ", async () => {
    const runner = fakeRunner(okAgy);
    const result = await analyzeVideo(INPUT, deps({ runner: runner.runner }));
    const serialized = JSON.stringify([runner.calls, result]);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("cdninstagram.com");
  });

  it("18 MB üstü: ffmpeg ile küçültülür, agy küçültülmüş dosyayı görür", async () => {
    let promptSeen = "";
    let shrunkExists = false;
    const runner = fakeRunner((options) => {
      promptSeen = options.input ?? "";
      shrunkExists = existsSync(path.join(options.cwd as string, "video-480p.mp4"));
      return { stdout: agyEnvelope(validOutput()) };
    }, 200);
    const result = await analyzeVideo(INPUT, deps({ runner: runner.runner, limits: { shrinkThresholdBytes: 500 } }));

    expect(result.status).toBe("ok");
    expect(runner.calls.map((c) => path.basename(c.command))).toEqual(["ffmpeg", "agy"]);
    expect(promptSeen).toContain('"video-480p.mp4"');
    expect(shrunkExists).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it("konuşma ve ekran yazısı < 8 kelime → insufficient_data (transcript döner, doğrulanmış değil)", async () => {
    const quiet = validOutput({
      transcript: [{ startSec: 1, text: "Comment RENEW", channel: "screen" }],
      hookText: "Comment RENEW",
      hookSource: "screen_text",
      sections: [],
      labels: [],
    });
    const result = await analyzeVideo(INPUT, deps({ runner: fakeRunner(() => ({ stdout: agyEnvelope(quiet) })).runner }));
    expect(result.status).toBe("insufficient_data");
    expect(result.evidenceVerified).toBe(false);
    if (result.status === "insufficient_data") expect(result.transcript.isMeaningful).toBe(false);
  });

  it("uydurma hook: ok ama evidenceVerified false", async () => {
    const liar = validOutput({ hookText: "A sentence that is nowhere in the video." });
    const result = await analyzeVideo(INPUT, deps({ runner: fakeRunner(() => ({ stdout: agyEnvelope(liar) })).runner }));
    expect(result.status).toBe("ok");
    expect(result.evidenceVerified).toBe(false);
  });

  it("429 geri çekilmesi ve düzeltme turu istatistiğe yansır", async () => {
    let n = 0;
    const runner = fakeRunner(() => {
      n += 1;
      if (n === 1) return { exitCode: 3, stderr: "429 RESOURCE_EXHAUSTED" };
      if (n === 2) return { stdout: agyEnvelope(validOutput({ hookType: "clickbait" as never })) };
      return { stdout: agyEnvelope(validOutput()) };
    });
    const sleep = vi.fn(noSleep);
    const result = await analyzeVideo(INPUT, deps({ runner: runner.runner, sleep }));
    expect(result.status).toBe("ok");
    expect(result.stats).toMatchObject({ calls: 3, retries: 1, correctionTurns: 1 });
    expect(sleep).toHaveBeenCalledWith(8_000);
  });
});

describe("analyzeVideo — hata yolları (fırlatmaz; failed + temp silinir)", () => {
  it("agy hatası → failed/agy_failed; klasör silinir; yapılan çağrı istatistikte", async () => {
    const result = await analyzeVideo(INPUT, deps({ runner: fakeRunner(() => ({ exitCode: 1, stderr: "boom" })).runner }));
    expect(result).toMatchObject({ status: "failed", evidenceVerified: false, failure: { kind: "agy_failed" }, stats: { calls: 1 } });
    expect(leftovers()).toEqual([]);
  });

  it("şema düzeltme turundan sonra da geçersiz → failed/invalid_output; klasör silinir", async () => {
    const bad = agyEnvelope(validOutput({ hookType: "clickbait" as never }));
    const result = await analyzeVideo(INPUT, deps({ runner: fakeRunner(() => ({ stdout: bad })).runner }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "invalid_output" }, stats: { calls: 2, correctionTurns: 1 } });
    expect(leftovers()).toEqual([]);
  });

  it("agy kurulu değil → failed/agy_missing", async () => {
    const runner = (): Promise<SubprocessResult> => Promise.reject(new SubprocessError("spawn_failed", "ENOENT"));
    const result = await analyzeVideo(INPUT, deps({ runner }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "agy_missing" } });
    expect(leftovers()).toEqual([]);
  });

  it("süresi dolmuş oe: indirme ve agy HİÇ başlamaz → failed/expired_url", async () => {
    const fetcher = createFakeFetch(() => videoResponse(10));
    const runner = fakeRunner(okAgy);
    const result = await analyzeVideo({ ...INPUT, videoUrl: cdnUrl(-60) }, deps({ fetch: fetcher.fetch, runner: runner.runner }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "expired_url" }, stats: { calls: 0 } });
    expect(fetcher.urls).toHaveLength(0);
    expect(runner.calls).toHaveLength(0);
    expect(leftovers()).toEqual([]);
  });

  it("izinsiz alan adı → failed/invalid_url; hiçbir istek yapılmaz", async () => {
    const fetcher = createFakeFetch(() => videoResponse(10));
    const result = await analyzeVideo({ ...INPUT, videoUrl: "https://evil.cdninstagram.com.attacker.com/a.mp4" }, deps({ fetch: fetcher.fetch }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "invalid_url" } });
    expect(fetcher.urls).toHaveLength(0);
  });

  it("tavanı aşan video → failed/too_large; agy çağrılmaz; yarım dosya kalmaz", async () => {
    const runner = fakeRunner(okAgy);
    const result = await analyzeVideo(INPUT, deps({ runner: runner.runner, limits: { maxDownloadBytes: 500 } }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "too_large" } });
    expect(runner.calls).toHaveLength(0);
    expect(leftovers()).toEqual([]);
  });

  it("ffmpeg yok → failed/ffmpeg_missing; agy çağrılmaz", async () => {
    const calls: string[] = [];
    const runner = (options: SubprocessOptions): Promise<SubprocessResult> => {
      calls.push(options.command);
      return Promise.reject(new SubprocessError("spawn_failed", "ENOENT"));
    };
    const result = await analyzeVideo(INPUT, deps({ runner, limits: { shrinkThresholdBytes: 10 } }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "ffmpeg_missing" } });
    expect(calls).toEqual(["ffmpeg"]);
    expect(leftovers()).toEqual([]);
  });

  it("beklenmeyen hata → failed/internal; ileti adres içermez; klasör silinir", async () => {
    const runner = (): Promise<SubprocessResult> => Promise.reject(new Error("patladı: https://x.cdninstagram.com/a.mp4?oh=secret-token"));
    const result = await analyzeVideo(INPUT, deps({ runner }));
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failure.kind).toBe("internal");
      expect(result.failure.message).not.toContain("secret-token");
      expect(result.failure.message).toContain("[adres]");
    }
    expect(leftovers()).toEqual([]);
  });

  it("geçersiz girdi → failed/invalid_input (ağa/CLI'ya gidilmez)", async () => {
    const fetcher = createFakeFetch(() => videoResponse(10));
    const result = await analyzeVideo({ ...INPUT, contentId: "" }, deps({ fetch: fetcher.fetch }));
    expect(result).toMatchObject({ status: "failed", failure: { kind: "invalid_input" } });
    expect(fetcher.urls).toHaveLength(0);
    const bad = await analyzeVideo({ ...INPUT, durationSec: -5 }, deps({ fetch: fetcher.fetch }));
    expect(bad).toMatchObject({ status: "failed", failure: { kind: "invalid_input" } });
  });

  it("failed sonucu da sürüm bilgilerini taşır (D kalıcı yazabilsin)", async () => {
    const result = await analyzeVideo(INPUT, deps({ runner: fakeRunner(() => ({ exitCode: 1, stderr: "x" })).runner }));
    expect(result).toMatchObject({ backend: "agy", taxonomyVersion: "2026-10-v1", contentId: "c-1" });
    expect(result.promptVersion).toMatch(/^video-analysis-/);
  });
});
