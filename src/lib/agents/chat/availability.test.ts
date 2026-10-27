import { describe, expect, it } from "vitest";

import { chatAvailability, claudeCliExists } from "@/lib/agents/chat/availability";

/** Yalnız verilen yollar var sayılır. */
const existing = (...paths: string[]) => (path: string) => paths.includes(path);

describe("sohbet kullanılabilirliği", () => {
  it("barındırılan ortamda (VERCEL) kapalı", () => {
    expect(chatAvailability({ env: { VERCEL: "1", PATH: "/usr/bin" }, platform: "linux", isExecutable: () => true })).toEqual({ available: false, reason: "hosted" });
  });

  it("anthropic_api saplaması ve geçersiz LLM_BACKEND kapalı", () => {
    const always = { platform: "linux" as const, isExecutable: () => true };
    expect(chatAvailability({ env: { LLM_BACKEND: "anthropic_api", PATH: "/bin" }, ...always })).toEqual({ available: false, reason: "backend" });
    expect(chatAvailability({ env: { LLM_BACKEND: "uydurma", PATH: "/bin" }, ...always })).toEqual({ available: false, reason: "backend" });
  });

  it("CLI PATH'te yoksa kapalı; varsa açık (POSIX)", () => {
    const env = { PATH: "/usr/local/bin:/usr/bin" };
    expect(chatAvailability({ env, platform: "linux", isExecutable: existing() })).toEqual({ available: false, reason: "cli_missing" });
    expect(chatAvailability({ env, platform: "linux", isExecutable: existing("/usr/bin/claude") })).toEqual({ available: true });
  });

  it("Windows'ta kabuksuz başlatma yalnız .exe çalıştırır: claude.exe aranır, .cmd sayılmaz", () => {
    const env = { PATH: "C:\\Users\\u\\bin;C:\\Windows" };
    const exe = "C:\\Users\\u\\bin\\claude.exe";
    expect(chatAvailability({ env, platform: "win32", isExecutable: existing(exe) }).available).toBe(true);
    expect(chatAvailability({ env, platform: "win32", isExecutable: existing("C:\\Users\\u\\bin\\claude.cmd") }).available).toBe(false);
  });

  it("CLAUDE_CLI_PATH tam yolsa doğrudan o dosya denetlenir (PATH aranmaz)", () => {
    const env = { PATH: "/usr/bin", CLAUDE_CLI_PATH: "/opt/claude/bin/claude" };
    expect(claudeCliExists({ env, platform: "linux", isExecutable: existing("/opt/claude/bin/claude") })).toBe(true);
    expect(claudeCliExists({ env, platform: "linux", isExecutable: existing("/usr/bin/claude") })).toBe(false);
  });

  it("açık dönüş (LLM_BACKEND boş = claude_cli) ve örnek veri kapatmaz: veri kaynağına bakılmaz", () => {
    expect(chatAvailability({ env: { PATH: "/bin", DATA_SOURCE: "mock" }, platform: "linux", isExecutable: existing("/bin/claude") })).toEqual({ available: true });
  });
});
