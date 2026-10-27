import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createLlmBackend, DEFAULT_LLM_BACKEND, resolveBackendId } from "@/lib/llm/backend";
import { BILLING_OF_BACKEND, LLM_KINDS, RUN_PROVIDER_OF_BACKEND } from "@/lib/llm/types";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";

describe("arka uç seçimi", () => {
  it("LLM_BACKEND yoksa/boşsa claude_cli; geçerli değerler tanınır", () => {
    expect(DEFAULT_LLM_BACKEND).toBe("claude_cli");
    expect(resolveBackendId(undefined)).toBe("claude_cli");
    expect(resolveBackendId("  ")).toBe("claude_cli");
    expect(resolveBackendId("claude_cli")).toBe("claude_cli");
    expect(resolveBackendId(" anthropic_api ")).toBe("anthropic_api");
  });

  it("yanlış yazılmış değer sessizce varsayılana düşmez: invalid_config", () => {
    expect(() => resolveBackendId("claude-cli")).toThrow(expect.objectContaining({ code: "invalid_config" }));
    expect(() => createLlmBackend({ env: { LLM_BACKEND: "openai" } })).toThrow(expect.objectContaining({ code: "invalid_config" }));
  });

  it("anthropic_api saplama: her çağrı not_implemented", async () => {
    const backend = createLlmBackend({ env: { LLM_BACKEND: "anthropic_api" } });
    expect(backend.id).toBe("anthropic_api");
    await expect(backend.runJson({ task: "llm_topic_screen", input: "x", schema: z.object({}) })).rejects.toMatchObject({ code: "not_implemented" });
  });

  it("varsayılan arka uç Claude CLI: env'deki CLAUDE_CLI_PATH ile çalıştırılır", async () => {
    const fake = createFakeSubprocess({
      stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "{}", structured_output: { ok: true } }),
    });
    const backend = createLlmBackend({ env: { CLAUDE_CLI_PATH: "C:\\bin\\claude.exe" }, claude: { run: fake.runner } });
    expect(backend.id).toBe("claude_cli");
    const out = await backend.runJson({ task: "llm_topic_cluster", input: "x", schema: z.object({ ok: z.boolean() }) });
    expect(out.value).toEqual({ ok: true });
    expect(out.meta).toMatchObject({ kind: "llm_topic_cluster", backend: "claude_cli", billing: "subscription", attempts: 1 });
    expect(fake.calls[0].command).toBe("C:\\bin\\claude.exe");
  });

  it("collection_runs eşlemesi: provider/billing DB check değerleriyle uyumlu; kind listesi 9 görev", () => {
    expect(RUN_PROVIDER_OF_BACKEND).toEqual({ claude_cli: "claude_cli", anthropic_api: "anthropic" });
    expect(BILLING_OF_BACKEND).toEqual({ claude_cli: "subscription", anthropic_api: "metered" });
    expect([...LLM_KINDS]).toEqual([
      "llm_topic_screen",
      "llm_voice_profile",
      "llm_topic_cluster",
      "llm_week_synthesis",
      "llm_idea_generation",
      "llm_angle_label",
      "llm_briefing",
      "llm_chat",
      "llm_director",
    ]);
  });
});
