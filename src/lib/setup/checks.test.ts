import { describe, expect, it } from "vitest";

import { checkApify, checkClaude, checkDb, checkEnv, checkFfmpeg, checkPgDump, checkWhisper, checksExitCode, formatChecks, runChecks, whisperModelDir, type CheckDeps, type CommandResult } from "./checks";

const FULL_ENV = {
  DATA_SOURCE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  LOCAL_USER_ID: "u",
  LOCAL_WORKSPACE_ID: "w",
  APIFY_TOKEN: "t",
  WHISPER_PYTHON: "/venv/bin/python",
};

const ok: CommandResult = { exitCode: 0, stdout: "" };

function deps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    env: FULL_ENV,
    run: async (command, args) => (command === "claude" && args[0] === "auth" ? { exitCode: 0, stdout: '{"loggedIn": true}' } : ok),
    exists: () => true,
    homeDir: "/home/x",
    pingDb: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("kurulum denetimi", () => {
  it("her şey tamamsa çıkış 0", async () => {
    const results = await runChecks(deps());
    expect(results.every((r) => r.ok)).toBe(true);
    expect(checksExitCode(results)).toBe(0);
    expect(formatChecks(results).at(-1)).toBe("Her şey tamam.");
  });

  it("boş ortamda her anahtarı adıyla ve ne yapılacağıyla söyler", async () => {
    const results = await runChecks(deps({ env: {}, run: async () => undefined, exists: () => false }));
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(checksExitCode(results)).toBe(1);
    const text = formatChecks(results).join("\n");
    expect(text).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(text).toContain("LOCAL_WORKSPACE_ID");
    expect(text).toContain("APIFY_TOKEN");
    expect(text).toContain("Ne yapmalı:");
  });

  it("gizli değeri çıktıya yazmaz", async () => {
    const secret = { ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: "GIZLI-DEGER-123", APIFY_TOKEN: "" };
    const text = formatChecks(await runChecks(deps({ env: secret }))).join("\n");
    expect(text).not.toContain("GIZLI-DEGER-123");
  });

  it("pg_dump yoksa madde olarak söyler (macOS: libpq), varsa tamam", async () => {
    const missing = await checkPgDump(deps({ run: async (command) => (command === "pg_dump" ? undefined : ok) }));
    expect(missing.ok).toBe(false);
    expect(missing.fix).toContain("brew install libpq");
    expect((await checkPgDump(deps())).ok).toBe(true);
    const all = await runChecks(deps({ run: async (command) => (command === "pg_dump" ? undefined : ok) }));
    expect(all.find((r) => r.id === "pg_dump")?.ok).toBe(false);
  });

  it("env eksiği kökteki .env.example'a yönlendirir", () => {
    const fix = checkEnv({}).find((r) => r.id === "env")?.fix ?? "";
    expect(fix).toContain(".env.example");
    expect(fix).not.toContain("kopya/");
  });

  it("DATA_SOURCE supabase değilse eksik", () => {
    const results = checkEnv({ ...FULL_ENV, DATA_SOURCE: "mock" });
    expect(results.find((r) => r.id === "env-kaynak")?.ok).toBe(false);
  });

  it("Claude: komut yok, girişsiz, girişli", async () => {
    expect((await checkClaude(deps({ run: async () => undefined }))).detail).toContain("bulunamadı");
    const loggedOut = await checkClaude(deps({ run: async (_c, a) => (a[0] === "auth" ? { exitCode: 0, stdout: '{"loggedIn": false}' } : ok) }));
    expect(loggedOut.ok).toBe(false);
    expect(loggedOut.detail).toContain("giriş yapılmamış");
    expect((await checkClaude(deps())).ok).toBe(true);
  });

  it("ffmpeg FFMPEG_BIN'i kullanır", async () => {
    const calls: string[] = [];
    await checkFfmpeg(deps({ env: { FFMPEG_BIN: "/opt/ff" }, run: async (c) => (calls.push(c), ok) }));
    expect(calls).toEqual(["/opt/ff"]);
    expect((await checkFfmpeg(deps({ run: async () => ({ exitCode: 1, stdout: "" }) }))).ok).toBe(false);
  });

  it("Whisper: python yok, paket yok, model yok, tamam", async () => {
    expect((await checkWhisper(deps({ env: {} }))).detail).toContain("WHISPER_PYTHON");
    expect((await checkWhisper(deps({ run: async () => ({ exitCode: 1, stdout: "" }) }))).detail).toContain("faster-whisper");
    const noModel = await checkWhisper(deps({ exists: () => false }));
    expect(noModel.ok).toBe(false);
    expect(noModel.detail).toContain("small");
    expect((await checkWhisper(deps())).ok).toBe(true);
  });

  it("model klasörü HF_HOME ve WHISPER_MODEL'e uyar", () => {
    expect(whisperModelDir({}, "/h", "small")).toBe("/h/.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots");
    expect(whisperModelDir({ HF_HOME: "/hf" }, "/h", "medium")).toBe("/hf/hub/models--Systran--faster-whisper-medium/snapshots");
  });

  it("Apify yalnız varlığa bakar", () => {
    expect(checkApify({}).ok).toBe(false);
    expect(checkApify({ APIFY_TOKEN: " " }).ok).toBe(false);
    expect(checkApify({ APIFY_TOKEN: "x" }).ok).toBe(true);
  });

  it("DB: anahtar yoksa bağlanmayı denemez, hata nedeni taşınır", async () => {
    let pinged = false;
    const none = await checkDb(deps({ env: {}, pingDb: async () => ((pinged = true), { ok: true }) }));
    expect(none.ok).toBe(false);
    expect(pinged).toBe(false);
    const bad = await checkDb(deps({ pingDb: async () => ({ ok: false, reason: "tablo yok" }) }));
    expect(bad.detail).toBe("tablo yok");
  });
});
