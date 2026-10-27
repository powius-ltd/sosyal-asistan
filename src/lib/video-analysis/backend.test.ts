import { describe, expect, it } from "vitest";

import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { createVideoAnalyzer, resolveBackend } from "@/lib/video-analysis/backend";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { cdnUrl, createFakeFetch, makeBaseDir, noSleep, NOW, videoResponse } from "@/lib/video-analysis/test-support";

describe("resolveBackend", () => {
  it("yok ya da boş → agy (.env.example boş satır yazar)", () => {
    expect(resolveBackend({})).toBe("agy");
    expect(resolveBackend({ VIDEO_ANALYSIS_BACKEND: "" })).toBe("agy");
    expect(resolveBackend({ VIDEO_ANALYSIS_BACKEND: "  " })).toBe("agy");
  });

  it("agy | gemini-api", () => {
    expect(resolveBackend({ VIDEO_ANALYSIS_BACKEND: "agy" })).toBe("agy");
    expect(resolveBackend({ VIDEO_ANALYSIS_BACKEND: "gemini-api" })).toBe("gemini-api");
  });

  it("geçersiz değer açık hata verir (sessizce agy'ye düşmez)", () => {
    expect(() => resolveBackend({ VIDEO_ANALYSIS_BACKEND: "openai" })).toThrow(VideoAnalysisError);
    expect(() => resolveBackend({ VIDEO_ANALYSIS_BACKEND: "openai" })).toThrow(/agy \| gemini-api/);
  });
});

describe("createVideoAnalyzer", () => {
  it("varsayılan agy arka ucu: model AGY_MODEL'den, varlık kontrolü agy --version", async () => {
    const fake = createFakeSubprocess({ stdout: "1.2.14\n" });
    const analyzer = createVideoAnalyzer({ env: { AGY_MODEL: "gemini-3.7-flash-low" }, runner: fake.runner });
    expect(analyzer.backend).toBe("agy");
    expect(analyzer.model).toBe("gemini-3.7-flash-low");
    await expect(analyzer.checkAvailable()).resolves.toEqual({ available: true, version: "1.2.14" });
    expect(fake.calls[0].args).toEqual(["--version"]);
  });

  it("agy analizörü analyze ile tam akışı çalıştırır (hata → failed sonucu, fırlatmaz)", async () => {
    const base = makeBaseDir();
    try {
      const fake = createFakeSubprocess({ exitCode: 1, stderr: "kapalı" });
      const analyzer = createVideoAnalyzer({
        env: {},
        runner: fake.runner,
        fetch: createFakeFetch(() => videoResponse(100)).fetch,
        now: () => NOW,
        sleep: noSleep,
        tempBaseDir: base.dir,
      });
      const result = await analyzer.analyze({ contentId: "c", videoUrl: cdnUrl(), isCompetitor: false });
      expect(result).toMatchObject({ status: "failed", failure: { kind: "agy_failed" } });
    } finally {
      base.cleanup();
    }
  });

  it("gemini-api: analyze not_implemented FIRLATIR (saplama); ağ/CLI'ya gitmez", async () => {
    const fake = createFakeSubprocess();
    const fetcher = createFakeFetch(() => videoResponse(10));
    const analyzer = createVideoAnalyzer({ env: { VIDEO_ANALYSIS_BACKEND: "gemini-api" }, runner: fake.runner, fetch: fetcher.fetch });
    expect(analyzer.backend).toBe("gemini-api");
    await expect(analyzer.analyze({ contentId: "c", videoUrl: cdnUrl(), isCompetitor: false })).rejects.toMatchObject({ name: "VideoAnalysisError", kind: "not_implemented" });
    await expect(analyzer.checkAvailable()).resolves.toMatchObject({ available: false });
    expect(fake.calls).toHaveLength(0);
    expect(fetcher.urls).toHaveLength(0);
  });

  it("geçersiz VIDEO_ANALYSIS_BACKEND kurulumda hata verir", () => {
    expect(() => createVideoAnalyzer({ env: { VIDEO_ANALYSIS_BACKEND: "x" } })).toThrow(VideoAnalysisError);
  });
});
