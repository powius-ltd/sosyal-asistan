import { describe, expect, it, vi } from "vitest";

import { SubprocessError, type SubprocessRunner } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import {
  buildAgyArgs,
  checkAgyAvailable,
  DEFAULT_AGY_MODEL,
  emptyStats,
  isQuotaFailure,
  QUOTA_BACKOFF_MS,
  readAgyConfig,
  runAgy,
  type AgyConfig,
} from "@/lib/video-analysis/agy-client";

const CONFIG: AgyConfig = { bin: "agy", model: DEFAULT_AGY_MODEL, timeoutMs: 360_000 };
const INPUT = { dir: "C:\\tmp\\work", schemaPath: "C:\\tmp\\work\\response-schema.json", prompt: "PROMPT" };

function deps(runner: SubprocessRunner, sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve())) {
  return { deps: { runner, sleep, config: CONFIG }, sleep };
}

describe("readAgyConfig", () => {
  it("varsayılan: PATH'te agy, gemini-3.8-flash-medium, 480 sn", () => {
    expect(readAgyConfig({})).toEqual({ bin: "agy", model: "gemini-3.8-flash-medium", timeoutMs: 480_000 });
    expect(DEFAULT_AGY_MODEL).toBe("gemini-3.8-flash-medium");
  });

  it("AGY_BIN / AGY_MODEL / AGY_TIMEOUT_MS okunur; boş değer tanımsız sayılır (.env.example boş satır yazar)", () => {
    expect(readAgyConfig({ AGY_BIN: "C:\\x\\agy.exe", AGY_MODEL: "gemini-3.7-flash-low", AGY_TIMEOUT_MS: "90000" })).toEqual({
      bin: "C:\\x\\agy.exe",
      model: "gemini-3.7-flash-low",
      timeoutMs: 90_000,
    });
    expect(readAgyConfig({ AGY_BIN: "", AGY_MODEL: "  ", AGY_TIMEOUT_MS: "abc" })).toEqual({ bin: "agy", model: DEFAULT_AGY_MODEL, timeoutMs: 480_000 });
  });
});

describe("buildAgyArgs", () => {
  it("doğrulanmış bayraklar: --model, --output-format json, --print-timeout, --json-schema, --add-dir, --sandbox (AGY_SANDBOX=off kapatır)", () => {
    expect(buildAgyArgs(CONFIG, INPUT)).toEqual([
      "--model",
      "gemini-3.8-flash-medium",
      "--output-format",
      "json",
      "--print-timeout",
      "360s",
      "--json-schema",
      INPUT.schemaPath,
      "--add-dir",
      INPUT.dir,
      "--sandbox",
    ]);
    expect(buildAgyArgs({ ...CONFIG, sandbox: false }, INPUT)).not.toContain("--sandbox");
    expect(readAgyConfig({ AGY_SANDBOX: "off" }).sandbox).toBe(false);
    expect(readAgyConfig({}).sandbox).toBeUndefined();
  });
});

describe("runAgy", () => {
  it("istemi stdin'den verir, cwd'yi izole klasöre ayarlar; shell yok (argüman dizisi)", async () => {
    const fake = createFakeSubprocess({ stdout: "{}" });
    const { deps: d } = deps(fake.runner);
    const stats = emptyStats();
    await expect(runAgy(INPUT, d, stats)).resolves.toBe("{}");

    const call = fake.calls[0];
    expect(call.command).toBe("agy");
    expect(call.input).toBe("PROMPT");
    expect(call.cwd).toBe(INPUT.dir);
    expect(call.args).toEqual(buildAgyArgs(CONFIG, INPUT));
    expect(call.timeoutMs).toBeGreaterThan(CONFIG.timeoutMs); // agy kendi sınırında önce kapanır
    expect(call.env).toBeUndefined(); // ortam yayılmaz: alt süreç ortamı izin listesinden kurulur (subprocess.ts, testli)
    expect(call.passEnv).toBeUndefined();
    expect(stats).toMatchObject({ calls: 1, retries: 0 });
  });

  it("429'da 8 sn sonra yeniden dener; başarılı olunca durur", async () => {
    const fake = createFakeSubprocess({ exitCode: 3, stderr: 'AGY_ERROR: {"code":429,"status":"RESOURCE_EXHAUSTED"}' }, { stdout: "tamam" });
    const { deps: d, sleep } = deps(fake.runner);
    const stats = emptyStats();
    await expect(runAgy(INPUT, d, stats)).resolves.toBe("tamam");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([8_000]);
    expect(fake.calls).toHaveLength(2);
    expect(stats).toMatchObject({ calls: 2, retries: 1 });
  });

  it("ikinci 429'da 16 sn bekler; üçüncü denemede başarır", async () => {
    const quota = { exitCode: 1, stderr: "quota exceeded for this minute" };
    const fake = createFakeSubprocess(quota, quota, { stdout: "sonunda" });
    const { deps: d, sleep } = deps(fake.runner);
    const stats = emptyStats();
    await expect(runAgy(INPUT, d, stats)).resolves.toBe("sonunda");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([8_000, 16_000]);
    expect(stats).toMatchObject({ calls: 3, retries: 2 });
    expect(QUOTA_BACKOFF_MS).toEqual([8_000, 16_000]);
  });

  it("kota sürerse 3 çağrıdan sonra agy_quota ile vazgeçer (sonsuz döngü yok)", async () => {
    const fake = createFakeSubprocess({ exitCode: 3, stderr: "429 Too Many Requests" });
    const { deps: d, sleep } = deps(fake.runner);
    const stats = emptyStats();
    await expect(runAgy(INPUT, d, stats)).rejects.toMatchObject({ name: "VideoAnalysisError", kind: "agy_quota" });
    expect(fake.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(stats).toMatchObject({ calls: 3, retries: 2 });
  });

  it("kota dışı hatada YENİDEN DENEMEZ: agy_failed", async () => {
    const fake = createFakeSubprocess({ exitCode: 1, stderr: "json-schema: root must be object" });
    const { deps: d, sleep } = deps(fake.runner);
    await expect(runAgy(INPUT, d, emptyStats())).rejects.toMatchObject({ kind: "agy_failed" });
    expect(fake.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("zaman aşımı agy_timeout (yeniden denenmez)", async () => {
    const fake = createFakeSubprocess({ timedOut: true, exitCode: null, durationMs: 380_000 });
    const { deps: d } = deps(fake.runner);
    await expect(runAgy(INPUT, d, emptyStats())).rejects.toMatchObject({ kind: "agy_timeout" });
    expect(fake.calls).toHaveLength(1);
  });

  it("agy kurulu değilse (spawn_failed) agy_missing", async () => {
    const runner: SubprocessRunner = () => Promise.reject(new SubprocessError("spawn_failed", "Süreç başlatılamadı (ENOENT): agy"));
    const { deps: d } = deps(runner);
    const stats = emptyStats();
    await expect(runAgy(INPUT, d, stats)).rejects.toMatchObject({ kind: "agy_missing" });
    expect(stats.calls).toBe(0);
  });

  it("süreyi toplar (bekleme süreleri hariç)", async () => {
    const fake = createFakeSubprocess({ exitCode: 1, stderr: "429", durationMs: 1000 }, { stdout: "x", durationMs: 4000 });
    const { deps: d } = deps(fake.runner);
    const stats = emptyStats();
    await runAgy(INPUT, d, stats);
    expect(stats.durationMs).toBe(5000);
  });
});

describe("isQuotaFailure", () => {
  it.each(["HTTP 429", "RESOURCE_EXHAUSTED", "Quota exceeded", "rate limit reached", "rate-limit", "Too Many Requests"])("kota imzası: %s", (text) => {
    expect(isQuotaFailure(text, "")).toBe(true);
    expect(isQuotaFailure("", text)).toBe(true);
  });

  it.each(["root must be object", "file not found", "exit 1", "4290 tokens"])("kota değil: %s", (text) => {
    expect(isQuotaFailure(text, "")).toBe(false);
  });
});

describe("checkAgyAvailable (agy --version)", () => {
  it("--version başarılıysa kullanılabilir; sürümü döndürür; model çağrısı yapmaz", async () => {
    const fake = createFakeSubprocess({ stdout: "1.2.14\n" });
    await expect(checkAgyAvailable({ runner: fake.runner, config: CONFIG })).resolves.toEqual({ available: true, version: "1.2.14" });
    expect(fake.calls[0].args).toEqual(["--version"]);
    expect(fake.calls[0].input).toBeUndefined();
  });

  it("agy yoksa kullanılamaz + sebep", async () => {
    const runner: SubprocessRunner = () => Promise.reject(new SubprocessError("spawn_failed", "ENOENT"));
    const result = await checkAgyAvailable({ runner, config: CONFIG });
    expect(result.available).toBe(false);
    expect(result.reason).toContain("agy bulunamadı");
  });

  it("sıfır olmayan çıkış kullanılamaz sayılır", async () => {
    const fake = createFakeSubprocess({ exitCode: 1, stderr: "bozuk kurulum" });
    const result = await checkAgyAvailable({ runner: fake.runner, config: CONFIG });
    expect(result.available).toBe(false);
  });
});
