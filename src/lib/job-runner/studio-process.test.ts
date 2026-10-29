/** Stüdyo süreci: argümanlar sabit, ortam izin listesi, yalnız bu hesabın anahtarı, anahtar hiçbir yere yazılmaz. */
import { describe, expect, it, vi } from "vitest";

import type { SubprocessRunner } from "@/lib/llm/subprocess";
import { createStudioRunner, studioVoiceKeyName } from "@/lib/job-runner/studio-process";

const ok = { exitCode: 0, timedOut: false, stdout: "bitti", stderr: "", durationMs: 1, truncated: false } as never;

describe("studio-process", () => {
  it("anahtar adı hesap slug'ından türer", () => {
    expect(studioVoiceKeyName("ornek-studyo")).toBe("ELEVENLABS_API_KEY_ORNEK_STUDYO");
    expect(studioVoiceKeyName("ornek-marka")).toBe("ELEVENLABS_API_KEY_ORNEK_MARKA");
  });

  it("sabit komut + fiş yolu; yalnız bu hesabın anahtarı ve sipariş kökü ortama girer; genel anahtarlar kaldırılır", async () => {
    const run = vi.fn<SubprocessRunner>(async () => ok);
    const runner = createStudioRunner({ run, studioDir: "/studyo", env: { ELEVENLABS_API_KEY_ORNEK_STUDYO: "gizli-ornek-studyo", ELEVENLABS_API_KEY_BASKA: "gizli-baska", ELEVENLABS_API_KEY: "genel" } });
    const result = await runner({ studioSlug: "ornek-studyo", ticketPath: "/kok/ornek-studyo/2026-10-26/x.md", root: "/kok" });
    expect(result).toMatchObject({ exitCode: 0, spawnFailed: false, timedOut: false });
    const call = run.mock.calls[0]?.[0];
    expect(call?.command).toBe("npm");
    expect(call?.args).toEqual(["--prefix", "/studyo", "run", "--silent", "siparis", "--", "--fis", "/kok/ornek-studyo/2026-10-26/x.md"]);
    expect(call?.env).toMatchObject({ ELEVENLABS_API_KEY_ORNEK_STUDYO: "gizli-ornek-studyo", KS_ORDERS_DIR: "/kok", ELEVENLABS_API_KEY: undefined, ANTHROPIC_API_KEY: undefined });
    expect(JSON.stringify(call?.env)).not.toContain("gizli-baska");
    expect(result.tail).not.toContain("gizli");
  });

  it("süreç başlatılamazsa fırlatmaz: spawnFailed", async () => {
    const run: SubprocessRunner = async () => {
      throw new Error("ENOENT");
    };
    expect(await createStudioRunner({ run, env: {} })({ studioSlug: "ornek-studyo", ticketPath: "/x.md", root: "/k" })).toMatchObject({ spawnFailed: true, exitCode: null });
  });
});
