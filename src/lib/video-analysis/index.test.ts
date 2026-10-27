import { describe, expect, it } from "vitest";

import * as api from "@/lib/video-analysis";

describe("lib/video-analysis dışa açılan yüzey", () => {
  it("D'nin (lib/intel) kullanacağı girişler tanımlı", () => {
    for (const name of [
      "analyzeVideo",
      "analyzeVideoFile",
      "createVideoAnalyzer",
      "resolveBackend",
      "resolveDeps",
      "checkAgyAvailable",
      "downloadVideo",
      "withTempDir",
      "sweepStaleTempDirs",
      "isVideoAnalysisError",
    ] as const) {
      expect(typeof api[name], name).toBe("function");
    }
  });

  it("sabitler: sürümler, tavanlar, saklama süresi", () => {
    expect(api.PROMPT_VERSION).toMatch(/^video-analysis-/);
    expect(api.DEFAULT_AGY_MODEL).toBe("gemini-3.8-flash-medium");
    expect(api.DEFAULT_MAX_DOWNLOAD_BYTES).toBe(60 * 1024 * 1024);
    expect(api.SHRINK_THRESHOLD_BYTES).toBe(18 * 1024 * 1024);
    expect(api.TRANSCRIPT_RETENTION_DAYS).toBe(90);
    expect(api.ALLOWED_CDN_DOMAINS).toEqual(["cdninstagram.com", "fbcdn.net"]);
  });
});
