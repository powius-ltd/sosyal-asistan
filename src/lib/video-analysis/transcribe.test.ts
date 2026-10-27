import { describe, expect, it } from "vitest";

import { SubprocessError } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { checkWhisperAvailable, readWhisperConfig, transcribeFile } from "@/lib/video-analysis/transcribe";

const OK_JSON = JSON.stringify({ language: "en", text: "Hello there. Welcome.", segments: [{ start: 0, end: 1.2, text: "Hello there." }, { start: 1.2, end: 2, text: "Welcome." }] });

describe("transcribeFile", () => {
  it("python + betik + dosya yolu; model/dil ortamla, çıktı zod ile doğrulanır", async () => {
    const fake = createFakeSubprocess({ stdout: OK_JSON });
    const result = await transcribeFile("/tmp/v.mp4", {
      runner: fake.runner,
      env: { WHISPER_PYTHON: "/venv/bin/python", WHISPER_SCRIPT: "/repo/tools/transcribe.py", WHISPER_MODEL: "base", WHISPER_LANGUAGE: "tr" },
    });
    expect(result).toEqual({ language: "en", text: "Hello there. Welcome.", segments: [{ start: 0, end: 1.2, text: "Hello there." }, { start: 1.2, end: 2, text: "Welcome." }] });
    expect(fake.calls[0].command).toBe("/venv/bin/python");
    expect(fake.calls[0].args).toEqual(["/repo/tools/transcribe.py", "/tmp/v.mp4"]);
    expect(fake.calls[0].env).toEqual({ WHISPER_MODEL: "base", WHISPER_LANGUAGE: "tr" });
  });

  it("varsayılanlar: python3, <cwd>/tools/transcribe.py, 300 sn", () => {
    const config = readWhisperConfig({});
    expect(config.python).toBe("python3");
    expect(config.script.endsWith("transcribe.py")).toBe(true);
    expect(config.timeoutMs).toBe(300_000);
  });

  it("sessiz video: boş metin, hata DEĞİL", async () => {
    const fake = createFakeSubprocess({ stdout: JSON.stringify({ language: "und", text: "", segments: [] }) });
    await expect(transcribeFile("/tmp/v.mp4", { runner: fake.runner, env: {} })).resolves.toMatchObject({ text: "", segments: [] });
  });

  it("yalnız 'You' sanrısı → konuşma boş", async () => {
    for (const text of ["You", "Thank you.", "Thanks for watching!"]) {
      const fake = createFakeSubprocess({ stdout: JSON.stringify({ language: "en", text, segments: [{ start: 0, end: 1, text }] }) });
      await expect(transcribeFile("/tmp/v.mp4", { runner: fake.runner, env: {} })).resolves.toMatchObject({ text: "", segments: [] });
    }
  });

  it("gerçek konuşma korunur (sanrı kelimesi içerse de)", async () => {
    const segments = [{ start: 0, end: 1, text: "You" }, { start: 1, end: 3, text: "You should stretch daily." }];
    const fake = createFakeSubprocess({ stdout: JSON.stringify({ language: "en", text: "You You should stretch daily.", segments }) });
    const result = await transcribeFile("/tmp/v.mp4", { runner: fake.runner, env: {} });
    expect(result.segments).toHaveLength(2);
    expect(result.text).toBe("You You should stretch daily.");
  });

  it("python yok → whisper_missing (sessiz boş metin yok)", async () => {
    const runner = () => Promise.reject(new SubprocessError("spawn_failed", "ENOENT"));
    await expect(transcribeFile("/tmp/v.mp4", { runner, env: {} })).rejects.toMatchObject({ kind: "whisper_missing" });
  });

  it("faster-whisper kurulu değil (çıkış kodu 3) → whisper_missing", async () => {
    const fake = createFakeSubprocess({ exitCode: 3, stderr: "faster-whisper kurulu değil" });
    await expect(transcribeFile("/tmp/v.mp4", { runner: fake.runner, env: {} })).rejects.toMatchObject({ kind: "whisper_missing" });
  });

  it("zaman aşımı → whisper_timeout; başka çıkış kodu → whisper_failed (stderr son satırı ileti)", async () => {
    await expect(transcribeFile("/tmp/v.mp4", { runner: createFakeSubprocess({ timedOut: true, exitCode: null }).runner, env: {} })).rejects.toMatchObject({ kind: "whisper_timeout" });
    const failed = createFakeSubprocess({ exitCode: 5, stderr: "uyarı\nRuntimeError: bozuk ses" });
    await expect(transcribeFile("/tmp/v.mp4", { runner: failed.runner, env: {} })).rejects.toMatchObject({ kind: "whisper_failed", message: expect.stringContaining("bozuk ses") });
  });

  it("JSON değil / şemaya uymuyor → whisper_failed", async () => {
    await expect(transcribeFile("/tmp/v.mp4", { runner: createFakeSubprocess({ stdout: "merhaba" }).runner, env: {} })).rejects.toMatchObject({ kind: "whisper_failed" });
    const wrong = createFakeSubprocess({ stdout: JSON.stringify({ language: "en", text: "x" }) });
    await expect(transcribeFile("/tmp/v.mp4", { runner: wrong.runner, env: {} })).rejects.toMatchObject({ kind: "whisper_failed" });
  });
});

describe("checkWhisperAvailable", () => {
  it("import faster_whisper başarılıysa hazır; yoksa ipucu verir", async () => {
    const config = readWhisperConfig({});
    await expect(checkWhisperAvailable(createFakeSubprocess({}).runner, config)).resolves.toEqual({ available: true });
    const missing = await checkWhisperAvailable(createFakeSubprocess({ exitCode: 1 }).runner, config);
    expect(missing.available).toBe(false);
    expect(missing.reason).toContain("faster-whisper");
    const noPython = await checkWhisperAvailable(() => Promise.reject(new SubprocessError("spawn_failed", "ENOENT")), config);
    expect(noPython.available).toBe(false);
  });
});
