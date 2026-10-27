import { getEventListeners } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { assertSuccess, buildChildEnv, runSubprocess, SubprocessError } from "@/lib/llm/subprocess";

/** Gerçek alt süreç: Node'un kendisi (kabuksuz). */
const NODE = process.execPath;
const node = (script: string) => ({ command: NODE, args: ["-e", script] as const });

describe("runSubprocess (gerçek süreç, kabuksuz)", () => {
  it("stdin girdisini okur, stdout'a yazar; çıkış kodu 0", async () => {
    const result = await runSubprocess({ ...node("process.stdin.pipe(process.stdout)"), input: "merhaba — ğüşiöç 😀", timeoutMs: 10_000 });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, truncatedStdout: false, truncatedStderr: false });
    expect(result.stdout).toBe("merhaba — ğüşiöç 😀");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sıfır olmayan çıkış HATA FIRLATMAZ: kod ve stderr sonuçta", async () => {
    const result = await runSubprocess({ ...node("console.error('kötü'); process.exit(3)"), timeoutMs: 10_000 });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("kötü");
  });

  it("zaman aşımında süreç öldürülür: timedOut true, çıkış kodu null", async () => {
    const started = Date.now();
    const result = await runSubprocess({ ...node("setInterval(() => {}, 1000)"), timeoutMs: 400 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("iptalde süreç öldürülür: exitCode null, timedOut false; zaman aşımını beklemez (saniyeler içinde biter)", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 300);
    const result = await runSubprocess({ ...node("process.stdout.write('basladi'); setInterval(() => {}, 1000)"), timeoutMs: 60_000, signal: controller.signal });
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("çağrıdan önce iptal edilmiş sinyal: süreç hiç başlatılmaz, hemen null çıkışlı sonuç döner", async () => {
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();
    const result = await runSubprocess({ ...node("process.stdout.write('basladi'); setInterval(() => {}, 1000)"), timeoutMs: 60_000, signal: controller.signal });
    expect(result).toMatchObject({ stdout: "", exitCode: null, timedOut: false, truncatedStdout: false });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("iptal dinleyicisi süreç bitince kaldırılır (normal bitiş ve iptal sonrası); iptal dışı bitiş sonucu etkilemez", async () => {
    const finished = new AbortController();
    const result = await runSubprocess({ ...node("process.stdout.write('tamam')"), timeoutMs: 10_000, signal: finished.signal });
    expect(result).toMatchObject({ stdout: "tamam", exitCode: 0 });
    expect(getEventListeners(finished.signal, "abort")).toHaveLength(0);

    const cancelled = new AbortController();
    setTimeout(() => cancelled.abort(), 200);
    await runSubprocess({ ...node("setInterval(() => {}, 1000)"), timeoutMs: 60_000, signal: cancelled.signal });
    expect(getEventListeners(cancelled.signal, "abort")).toHaveLength(0);
  });

  it("stdout sınırı aşılınca süreç öldürülür ve çıktı kırpılır (bellek sınırlı)", async () => {
    const result = await runSubprocess({
      ...node("const big = 'x'.repeat(65536); setInterval(() => process.stdout.write(big), 1)"),
      timeoutMs: 15_000,
      maxStdoutBytes: 100_000,
    });
    expect(result.truncatedStdout).toBe(true);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(100_000);
    expect(result.exitCode).toBeNull();
  });

  it("stderr sınırı aşılınca fazlası atılır ama süreç bitene kadar çalışır", async () => {
    const result = await runSubprocess({
      ...node("process.stderr.write('e'.repeat(50000)); process.stdout.write('tamam')"),
      timeoutMs: 10_000,
      maxStderrBytes: 1_000,
    });
    expect(result.truncatedStderr).toBe(true);
    expect(result.stderr.length).toBeLessThanOrEqual(1_000);
    expect(result).toMatchObject({ stdout: "tamam", exitCode: 0 });
  });

  it("girdiyi hiç okumayan süreçte büyük stdin hata vermez (EPIPE yutulur)", async () => {
    const result = await runSubprocess({ ...node("process.exit(0)"), input: "y".repeat(2_000_000), timeoutMs: 10_000 });
    expect(result.exitCode).toBe(0);
  });

  it("kabuk yorumlamaz: argümandaki metakarakterler düz metindir", async () => {
    const result = await runSubprocess({ command: NODE, args: ["-e", "process.stdout.write(process.argv[1])", "a && echo sızdı; $(x) `y`"], timeoutMs: 10_000 });
    expect(result.stdout).toBe("a && echo sızdı; $(x) `y`");
  });

  it("env üstüne eklenir ve değer iletiye/sonuca sızmaz; undefined değişkeni kaldırır", async () => {
    const result = await runSubprocess({
      ...node("process.stdout.write(`${process.env.SOSYAL_TEST_A}|${process.env.SOSYAL_TEST_B}`)"),
      timeoutMs: 10_000,
      env: { SOSYAL_TEST_A: "deger", SOSYAL_TEST_B: undefined },
    });
    expect(result.stdout).toBe("deger|undefined");
  });

  it("ortam izin listesi: servis anahtarları alt sürece GEÇMEZ, sistem değişkenleri ve passEnv geçer", async () => {
    const secrets = ["SUPABASE_SERVICE_ROLE_KEY", "APIFY_TOKEN", "CRON_SECRET", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"];
    for (const name of [...secrets, "SOSYAL_TEST_PASS"]) vi.stubEnv(name, "gizli-deger");
    try {
      const script = "process.stdout.write(JSON.stringify(Object.keys(process.env)))";
      const plain = JSON.parse((await runSubprocess({ ...node(script), timeoutMs: 10_000 })).stdout) as string[];
      for (const name of secrets) expect(plain).not.toContain(name);
      expect(plain.map((n) => n.toUpperCase())).toContain("PATH");
      const passed = JSON.parse((await runSubprocess({ ...node(script), timeoutMs: 10_000, passEnv: ["sosyal_test_pass"] })).stdout) as string[];
      expect(passed).toContain("SOSYAL_TEST_PASS");
      for (const name of secrets) expect(passed).not.toContain(name);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("buildChildEnv: önek izni, büyük/küçük harf duyarsız ad, env üstüne yazar ve undefined kaldırır", () => {
    const env = buildChildEnv(
      { Path: "p", ProgramFiles: "pf", "ProgramFiles(x86)": "pf86", ANTHROPIC_API_KEY: "k", CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CODE_MESSAGING_TOKEN: "m", TEMP: "t1" },
      { passEnv: ["CLAUDE_CODE_OAUTH_TOKEN"], env: { temp: "t2", Path: undefined } },
    );
    expect(env).toEqual({ ProgramFiles: "pf", "ProgramFiles(x86)": "pf86", CLAUDE_CODE_OAUTH_TOKEN: "t", temp: "t2" });
  });

  it("başlatılamayan komut SubprocessError('spawn_failed'); ileti komut adını verir, ortam değişkenlerini değil", async () => {
    await expect(runSubprocess({ command: "bu-komut-yok-0xdeadbeef", timeoutMs: 5_000, env: { GIZLI: "s3cret" } })).rejects.toMatchObject({
      name: "SubprocessError",
      code: "spawn_failed",
      message: expect.not.stringContaining("s3cret"),
    });
  });

  it("geçersiz zaman aşımı reddedilir", async () => {
    await expect(runSubprocess({ command: NODE, timeoutMs: 0 })).rejects.toBeInstanceOf(RangeError);
  });
});

describe("assertSuccess", () => {
  const ok = { stdout: "çıktı", stderr: "", exitCode: 0, timedOut: false, truncatedStdout: false, truncatedStderr: false, durationMs: 5 };

  it("başarılı sonucu olduğu gibi döndürür", () => {
    expect(assertSuccess(ok, "agy")).toBe(ok);
  });

  it("zaman aşımı, bayt sınırı ve sıfır olmayan çıkış ayrı kodlarla fırlar; ileti stderr'den kısa parça taşır, stdout'u taşımaz", () => {
    expect(() => assertSuccess({ ...ok, timedOut: true, exitCode: null }, "agy")).toThrowError(expect.objectContaining({ code: "timeout" }));
    expect(() => assertSuccess({ ...ok, truncatedStdout: true, exitCode: null }, "agy")).toThrowError(expect.objectContaining({ code: "output_too_large" }));
    try {
      assertSuccess({ ...ok, exitCode: 2, stderr: "429 quota exceeded\n".repeat(100), stdout: "GIZLI-CIKTI" }, "agy");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SubprocessError);
      const message = (error as SubprocessError).message;
      expect(message).toContain("çıkış kodu 2");
      expect(message).toContain("429 quota exceeded");
      expect(message).not.toContain("GIZLI-CIKTI");
      expect(message.length).toBeLessThan(600);
    }
  });
});

describe("createFakeSubprocess", () => {
  it("çağrıları kaydeder, yanıtları sırayla tüketir, bitince sonuncuyu tekrarlar; işlev yanıtı girdiyi görür", async () => {
    const fake = createFakeSubprocess({ stdout: "bir" }, (options) => ({ stdout: `girdi:${options.input}`, exitCode: 1 }));
    expect((await fake.runner({ command: "x", timeoutMs: 1, input: "a" })).stdout).toBe("bir");
    expect(await fake.runner({ command: "x", timeoutMs: 1, input: "b" })).toMatchObject({ stdout: "girdi:b", exitCode: 1 });
    expect((await fake.runner({ command: "x", timeoutMs: 1, input: "c" })).stdout).toBe("girdi:c");
    expect(fake.calls.map((c) => c.input)).toEqual(["a", "b", "c"]);
  });

  it("iptal sözleşmesi: önceden iptalse yanıt tüketilmez; yanıt beklenirken iptal edilirse hemen null çıkışlı sonuç; dinleyici kalkar", async () => {
    const fake = createFakeSubprocess({ stdout: "ilk" }, () => new Promise(() => undefined) /* hiç bitmeyen süreç */);
    const aborted = new AbortController();
    aborted.abort();
    expect(await fake.runner({ command: "x", timeoutMs: 1, signal: aborted.signal })).toMatchObject({ stdout: "", exitCode: null, timedOut: false });
    expect(await fake.runner({ command: "x", timeoutMs: 1 })).toMatchObject({ stdout: "ilk", exitCode: 0 }); // önceki çağrı yanıt tüketmedi

    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 100);
    expect(await fake.runner({ command: "x", timeoutMs: 1, signal: controller.signal })).toMatchObject({ exitCode: null });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

    const finished = new AbortController();
    const quick = createFakeSubprocess({ stdout: "tamam" });
    expect(await quick.runner({ command: "x", timeoutMs: 1, signal: finished.signal })).toMatchObject({ stdout: "tamam", exitCode: 0 });
    expect(getEventListeners(finished.signal, "abort")).toHaveLength(0);
  });

  it("yanıt verilmezse boş başarılı sonuç", async () => {
    const fake = createFakeSubprocess();
    expect(await fake.runner({ command: "x", timeoutMs: 1 })).toMatchObject({ stdout: "", exitCode: 0, timedOut: false });
  });
});
