import { afterEach, describe, expect, it, vi } from "vitest";

import { getIntegrationStatuses } from "@/lib/settings/integrations";

afterEach(() => vi.unstubAllEnvs());

const find = (key: string) => {
  const status = getIntegrationStatuses().find((s) => s.key === key);
  if (!status) throw new Error(`entegrasyon yok: ${key}`);
  return status;
};

describe("getIntegrationStatuses", () => {
  it("Gemini (agy) ve Claude CLI satırları var; env değişkenleri isteğe bağlı (optional)", () => {
    for (const key of ["gemini_agy", "claude_cli"]) {
      expect(find(key).optional, key).toBe(true);
    }
    expect(find("gemini_agy").envVars.map((v) => v.name)).toEqual(["VIDEO_ANALYSIS_BACKEND", "AGY_BIN", "AGY_MODEL", "AGY_MAX_CALLS_PER_RUN", "AGY_TIMEOUT_MS", "FFMPEG_BIN"]);
    expect(find("claude_cli").envVars.map((v) => v.name)).toEqual(["LLM_BACKEND", "LLM_MODEL_LIGHT", "CLAUDE_CLI_PATH"]);
  });

  it("isteğe bağlı entegrasyon: hiçbir değişken yoksa configured false (hata değil, optional); biri varsa true", () => {
    for (const name of ["VIDEO_ANALYSIS_BACKEND", "AGY_BIN", "AGY_MODEL", "AGY_MAX_CALLS_PER_RUN", "AGY_TIMEOUT_MS", "FFMPEG_BIN", "LLM_BACKEND", "LLM_MODEL_LIGHT", "CLAUDE_CLI_PATH"]) vi.stubEnv(name, "");
    expect(find("gemini_agy")).toMatchObject({ configured: false, optional: true });
    vi.stubEnv("AGY_BIN", "C:\\araclar\\agy.exe");
    expect(find("gemini_agy").configured).toBe(true);
    expect(find("claude_cli").configured).toBe(false);
    vi.stubEnv("CLAUDE_CLI_PATH", "C:\\araclar\\claude.exe");
    expect(find("claude_cli").configured).toBe(true);
  });

  it("zorunlu entegrasyon: TÜM değişkenler tanımlı olmalı; optional alanı yok", () => {
    vi.stubEnv("META_APP_ID", "id");
    vi.stubEnv("META_APP_SECRET", "");
    expect(find("meta")).toMatchObject({ configured: false });
    expect("optional" in find("meta")).toBe(false);
    vi.stubEnv("META_APP_SECRET", "gizli");
    expect(find("meta").configured).toBe(true);
  });

  it("DEĞER asla dönmez: yalnız ad ve var/yok", () => {
    vi.stubEnv("AGY_BIN", "C:\\cok-gizli-yol\\agy.exe");
    vi.stubEnv("META_APP_SECRET", "cok-gizli-deger");
    const json = JSON.stringify(getIntegrationStatuses());
    expect(json).not.toContain("cok-gizli");
    expect(json).toContain("AGY_BIN");
  });
});
