import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MAX_ARGV_CHARS, buildClaudeArgs, toCliJsonSchema } from "@/lib/llm/claude-cli-args";
import { createClaudeCliBackend, runClaudeJson } from "@/lib/llm/claude-cli";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { buildChildEnv, SubprocessError } from "@/lib/llm/subprocess";
import { LlmError } from "@/lib/llm/types";

const schema = z.object({ answer: z.string(), items: z.array(z.object({ id: z.string(), kind: z.enum(["a", "b"]) })).min(1) });
const good = { answer: "4", items: [{ id: "x1", kind: "a" }] };

/** Gerçek çağrıda gözlenen zarf şekli (2.1.284). */
const envelope = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: JSON.stringify(good),
    structured_output: good,
    total_cost_usd: 0.02,
    duration_ms: 5252,
    usage: { input_tokens: 2, cache_creation_input_tokens: 1898, cache_read_input_tokens: 100, output_tokens: 453 },
    modelUsage: { "claude-opus-5-5[1m]": { canonicalModel: "claude-opus-5-5", costUSD: 0.02 } },
    ...over,
  });

const request = { task: "llm_topic_screen" as const, system: "Sistem talimatı", input: "Girdi metni — ğüşiöç", schema };

describe("toCliJsonSchema / buildClaudeArgs", () => {
  it("$schema silinir (CLI reddeder), kök nesne, draft-07 alanları korunur", () => {
    const json = JSON.parse(toCliJsonSchema(schema));
    expect(json.$schema).toBeUndefined();
    expect(json).toMatchObject({ type: "object", additionalProperties: false, required: ["answer", "items"] });
    expect(json.properties.items).toMatchObject({ type: "array", minItems: 1 });
    expect(json.properties.items.items.properties.kind.enum).toEqual(["a", "b"]);
  });

  it("kök nesne olmayan şema reddedilir", () => {
    expect(() => toCliJsonSchema(z.array(z.string()))).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });

  it("araçlar/CLAUDE.md/MCP/oturum kapalı bayrakları + sistem istemi + model", () => {
    const args = buildClaudeArgs({ schemaJson: "{}", system: "SYS", model: " sonnet " });
    expect(args).toEqual([
      "-p", "--output-format", "json", "--json-schema", "{}", "--no-session-persistence",
      "--tools", "", "--safe-mode", "--strict-mcp-config", "--disable-slash-commands", "--permission-prompts", "none",
      "--system-prompt", "SYS", "--model", "sonnet",
    ]);
  });

  it("sistem istemi/model yoksa ilgili bayraklar da yok", () => {
    const args = buildClaudeArgs({ schemaJson: "{}" });
    expect(args).not.toContain("--system-prompt");
    expect(args).not.toContain("--model");
  });

  it("argüman toplamı sınırı aşarsa başlamadan reddeder", () => {
    expect(() => buildClaudeArgs({ schemaJson: "{}", system: "x".repeat(MAX_ARGV_CHARS) })).toThrow(expect.objectContaining({ code: "invalid_input" }));
  });
});

describe("runClaudeJson: başarılı yol", () => {
  it("girdi stdin'den gider (argümana girmez), cwd geçici klasör ve sonra silinir; meta dolu", async () => {
    const fake = createFakeSubprocess({ stdout: envelope(), durationMs: 1200 });
    const result = await runClaudeJson(request, { run: fake.runner, env: {} });

    expect(result.value).toEqual(good);
    expect(result.meta).toEqual({
      kind: "llm_topic_screen",
      backend: "claude_cli",
      billing: "subscription",
      model: "claude-opus-5-5",
      durationMs: 1200,
      attempts: 1,
      costUsd: 0.02,
      usage: { inputTokens: 2 + 1898 + 100, outputTokens: 453 },
    });

    const [call] = fake.calls;
    expect(call.command).toBe("claude");
    expect(call.input).toBe(request.input);
    expect(call.args?.join("\n")).not.toContain("Girdi metni");
    expect(call.args).toContain("--tools");
    expect(call.args).toContain("--safe-mode");
    expect(call.cwd).toBeTruthy();
    expect(existsSync(call.cwd as string)).toBe(false); // finally ile silindi
  });

  it("alt sürece yalnız abonelik girişi adları ek olarak geçer; ANTHROPIC_* izin listesinde değildir (abonelik çağrısı API faturasına dönmesin)", async () => {
    const fake = createFakeSubprocess({ stdout: envelope() });
    await runClaudeJson(request, { run: fake.runner, env: {} });
    expect(fake.calls[0].passEnv).toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CONFIG_DIR"]);
    expect(buildChildEnv({ ANTHROPIC_API_KEY: "k", CLAUDE_CODE_OAUTH_TOKEN: "t" }, fake.calls[0])).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "t" });
  });

  it("CLAUDE_CLI_PATH yürütülebilir dosyayı seçer; `executable` onu ezer", async () => {
    const a = createFakeSubprocess({ stdout: envelope() });
    await runClaudeJson(request, { run: a.runner, env: { CLAUDE_CLI_PATH: "C:\\tools\\claude.exe" } });
    expect(a.calls[0].command).toBe("C:\\tools\\claude.exe");

    const b = createFakeSubprocess({ stdout: envelope() });
    await runClaudeJson(request, { run: b.runner, env: { CLAUDE_CLI_PATH: "C:\\tools\\claude.exe" }, executable: "D:\\x\\claude.exe" });
    expect(b.calls[0].command).toBe("D:\\x\\claude.exe");
  });

  it("model isteği varsayılanı ezer; ikisi de yoksa zarftaki ad meta'ya girer", async () => {
    const fake = createFakeSubprocess({ stdout: envelope() });
    await runClaudeJson({ ...request, model: "opus" }, { run: fake.runner, env: {}, defaultModel: "sonnet" });
    expect(fake.calls[0].args).toContain("opus");
    expect(fake.calls[0].args).not.toContain("sonnet");
  });

  it("structured_output yoksa `result` metnine düşer (çitli JSON da okunur)", async () => {
    const fake = createFakeSubprocess({ stdout: envelope({ structured_output: undefined, result: `Tamam:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`` }) });
    const result = await runClaudeJson(request, { run: fake.runner, env: {} });
    expect(result.value).toEqual(good);
    expect(result.meta.attempts).toBe(1);
  });

  it("zarf dizi olarak gelirse sonuncu `result` öğesi alınır", async () => {
    const list = JSON.stringify([{ type: "system", subtype: "init" }, JSON.parse(envelope())]);
    const fake = createFakeSubprocess({ stdout: list });
    expect((await runClaudeJson(request, { run: fake.runner, env: {} })).value).toEqual(good);
  });

  it("LlmBackend görünümü aynı çağrıyı yapar", async () => {
    const fake = createFakeSubprocess({ stdout: envelope() });
    const backend = createClaudeCliBackend({ run: fake.runner, env: {}, defaultModel: "sonnet" });
    expect(backend.id).toBe("claude_cli");
    expect((await backend.runJson(request)).value).toEqual(good);
    expect(fake.calls[0].args).toContain("sonnet");
  });
});

describe("runClaudeJson: hatalar", () => {
  it("is_error zarfı → cli_failed (ileti + maliyet meta'da), yeniden denenmez", async () => {
    const fake = createFakeSubprocess({ stdout: envelope({ is_error: true, subtype: "error_during_execution", result: "Rate limit reached", structured_output: undefined }) });
    const error = await runClaudeJson(request, { run: fake.runner, env: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "cli_failed", meta: { attempts: 1, kind: "llm_topic_screen" } });
    expect(error.message).toContain("Rate limit reached");
    expect(fake.calls).toHaveLength(1);
  });

  it("sıfır çıkış kodu → cli_failed; zarf varsa ileti oradan, yoksa stderr'den", async () => {
    const withEnvelope = createFakeSubprocess({ exitCode: 1, stdout: envelope({ is_error: true, result: "Not logged in", structured_output: undefined }) });
    await expect(runClaudeJson(request, { run: withEnvelope.runner, env: {} })).rejects.toMatchObject({ code: "cli_failed", message: expect.stringContaining("Not logged in") });

    const withStderr = createFakeSubprocess({ exitCode: 2, stdout: "", stderr: "boom: bad flag" });
    await expect(runClaudeJson(request, { run: withStderr.runner, env: {} })).rejects.toMatchObject({ code: "cli_failed", message: expect.stringContaining("boom: bad flag") });
  });

  it("zaman aşımı → timeout (yeniden denenmez)", async () => {
    const fake = createFakeSubprocess({ timedOut: true, exitCode: null, durationMs: 180_000 });
    await expect(runClaudeJson(request, { run: fake.runner, env: {} })).rejects.toMatchObject({ code: "timeout", meta: { attempts: 1, durationMs: 180_000 } });
    expect(fake.calls).toHaveLength(1);
  });

  it("çıktı sınırı aşıldı → output_too_large", async () => {
    const fake = createFakeSubprocess({ truncatedStdout: true, exitCode: null });
    await expect(runClaudeJson(request, { run: fake.runner, env: {} })).rejects.toMatchObject({ code: "output_too_large" });
  });

  it("süreç başlatılamadı (CLI yok) → spawn_failed", async () => {
    const runner = async () => {
      throw new SubprocessError("spawn_failed", "Süreç başlatılamadı (ENOENT): claude");
    };
    await expect(runClaudeJson(request, { run: runner, env: {} })).rejects.toMatchObject({ code: "spawn_failed" });
  });

  it("zarf JSON değilse / sonuç öğesi yoksa → envelope_invalid", async () => {
    await expect(runClaudeJson(request, { run: createFakeSubprocess({ stdout: "merhaba" }).runner, env: {} })).rejects.toMatchObject({ code: "envelope_invalid" });
    await expect(runClaudeJson(request, { run: createFakeSubprocess({ stdout: '{"type":"system"}' }).runner, env: {} })).rejects.toMatchObject({ code: "envelope_invalid" });
  });

  it("boş girdi ve devasa girdi çağrı yapılmadan reddedilir", async () => {
    const fake = createFakeSubprocess({ stdout: envelope() });
    await expect(runClaudeJson({ ...request, input: "  " }, { run: fake.runner, env: {} })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(runClaudeJson({ ...request, input: "x".repeat(700_000) }, { run: fake.runner, env: {} })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fake.calls).toHaveLength(0);
  });

  it("hatada da geçici klasör silinir", async () => {
    const fake = createFakeSubprocess({ exitCode: 1, stderr: "x" });
    await runClaudeJson(request, { run: fake.runner, env: {} }).catch(() => undefined);
    expect(existsSync(fake.calls[0].cwd as string)).toBe(false);
  });
});

describe("runClaudeJson: düzeltme turu", () => {
  it("bozuk JSON → 1 düzeltme turu: ikinci stdin özgün girdi + önceki yanıt + sorun; attempts 2, maliyet/token toplanır", async () => {
    const fake = createFakeSubprocess(
      { stdout: envelope({ structured_output: undefined, result: "{ bu json degil", total_cost_usd: 0.01, usage: { input_tokens: 1, output_tokens: 10 } }), durationMs: 500 },
      { stdout: envelope({ total_cost_usd: 0.02, usage: { input_tokens: 2, output_tokens: 20 } }), durationMs: 700 },
    );
    const result = await runClaudeJson(request, { run: fake.runner, env: {} });
    expect(result.value).toEqual(good);
    expect(result.meta).toMatchObject({ attempts: 2, durationMs: 1200, usage: { inputTokens: 3, outputTokens: 30 } });
    expect(result.meta.costUsd).toBeCloseTo(0.03);

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].input).toContain(request.input);
    expect(fake.calls[1].input).toContain("{ bu json degil");
    expect(fake.calls[1].input).toContain("REVISION REQUEST");
  });

  it("şema hatası → zod sorunları (yol: ileti) düzeltme turuna girer", async () => {
    const fake = createFakeSubprocess({ stdout: envelope({ structured_output: { answer: 5, items: [] } }) }, { stdout: envelope() });
    const result = await runClaudeJson(request, { run: fake.runner, env: {} });
    expect(result.meta.attempts).toBe(2);
    expect(fake.calls[1].input).toMatch(/answer: /);
    expect(fake.calls[1].input).toMatch(/items: /);
  });

  it("iki denemede de geçersiz → invalid_output (en fazla 2 çağrı)", async () => {
    const fake = createFakeSubprocess({ stdout: envelope({ structured_output: { answer: 5 } }) });
    const error = await runClaudeJson(request, { run: fake.runner, env: {} }).catch((e) => e);
    expect(error).toMatchObject({ code: "invalid_output", meta: { attempts: 2 } });
    expect(fake.calls).toHaveLength(2);
  });

  it("review sorunu düzeltme turuna girer; ikinci yanıt geçerliyse döner", async () => {
    const first = { answer: "yanlış", items: [{ id: "x1", kind: "a" }] };
    const fake = createFakeSubprocess({ stdout: envelope({ structured_output: first }) }, { stdout: envelope() });
    const review = (value: z.infer<typeof schema>) => (value.answer === "4" ? undefined : `answer 4 olmalı, "${value.answer}" gelmiş`);
    const result = await runClaudeJson({ ...request, review }, { run: fake.runner, env: {} });
    expect(result.value.answer).toBe("4");
    expect(result.meta.attempts).toBe(2);
    expect(fake.calls[1].input).toContain('answer 4 olmalı, "yanlış" gelmiş');
  });

  it("son denemede review hâlâ sorunluysa: varsayılan throw; reviewFailure=accept değeri + geri bildirimi verir", async () => {
    const bad = { answer: "yanlış", items: [{ id: "x1", kind: "a" }] };
    const review = () => "hep sorunlu";
    const makeFake = () => createFakeSubprocess({ stdout: envelope({ structured_output: bad }) });

    await expect(runClaudeJson({ ...request, review }, { run: makeFake().runner, env: {} })).rejects.toMatchObject({ code: "invalid_output", message: expect.stringContaining("hep sorunlu") });

    const accepted = await runClaudeJson({ ...request, review, reviewFailure: "accept" }, { run: makeFake().runner, env: {} });
    expect(accepted.value).toEqual(bad);
    expect(accepted.reviewFeedback).toBe("hep sorunlu");
    expect(accepted.meta.attempts).toBe(2);
  });

  it("maxAttempts=1: sorunlu yanıtta ikinci çağrı YOK (review sorunu: accept ile değer, throw ile hata; şema hatası: hata); genel sınır artmaz", async () => {
    const bad = { answer: "yanlış", items: [{ id: "x1", kind: "a" }] };
    const review = () => "hep sorunlu";
    const accepted = createFakeSubprocess({ stdout: envelope({ structured_output: bad }) });
    const result = await runClaudeJson({ ...request, review, reviewFailure: "accept", maxAttempts: 1 }, { run: accepted.runner, env: {} });
    expect(result.value).toEqual(bad);
    expect(result.reviewFeedback).toBe("hep sorunlu");
    expect(result.meta.attempts).toBe(1);
    expect(accepted.calls).toHaveLength(1);

    const thrown = createFakeSubprocess({ stdout: envelope({ structured_output: bad }) });
    await expect(runClaudeJson({ ...request, review, maxAttempts: 1 }, { run: thrown.runner, env: {} })).rejects.toMatchObject({ code: "invalid_output", meta: { attempts: 1 } });
    expect(thrown.calls).toHaveLength(1);

    const invalid = createFakeSubprocess({ stdout: envelope({ structured_output: { answer: 5 } }) });
    await expect(runClaudeJson({ ...request, maxAttempts: 1 }, { run: invalid.runner, env: {} })).rejects.toMatchObject({ code: "invalid_output" });
    expect(invalid.calls).toHaveLength(1);

    const capped = createFakeSubprocess({ stdout: envelope({ structured_output: { answer: 5 } }) });
    await expect(runClaudeJson({ ...request, maxAttempts: 9 }, { run: capped.runner, env: {} })).rejects.toMatchObject({ code: "invalid_output" });
    expect(capped.calls).toHaveLength(2);
  });

  it("şema hâlâ geçersizken reviewFailure=accept yine throw (değer yok)", async () => {
    const fake = createFakeSubprocess({ stdout: envelope({ structured_output: { nope: 1 } }) });
    await expect(runClaudeJson({ ...request, reviewFailure: "accept" }, { run: fake.runner, env: {} })).rejects.toMatchObject({ code: "invalid_output" });
  });
});
