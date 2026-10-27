import { describe, expect, it } from "vitest";

import { LlmError } from "@/lib/llm/types";
import { isLlmUnavailableError, isPersistentLlmFailureLine, tapLlmFailure } from "@/lib/orchestrator/llm-failure";

describe("kalıcı LLM hatası", () => {
  it("fırlayan hata: CLI yok/oturum yok/yapılandırma kalıcı; zaman aşımı ve geçersiz çıktı değil", () => {
    for (const code of ["spawn_failed", "cli_failed", "invalid_config"] as const) expect(isLlmUnavailableError(new LlmError(code, "x"))).toBe(true);
    for (const code of ["timeout", "invalid_output", "envelope_invalid"] as const) expect(isLlmUnavailableError(new LlmError(code, "x"))).toBe(false);
    expect(isLlmUnavailableError(new Error("başka"))).toBe(false);
  });

  it("etiketleme günlüğü biçimi (label-run): kalıcı kodlar yakalanır, parti hatası (invalid_output) yakalanmaz", () => {
    expect(isPersistentLlmFailureLine("[1/3] parti başarısız (spawn_failed): claude bulunamadı — kalan 20 içerik denenmedi")).toBe(true);
    expect(isPersistentLlmFailureLine("[2/3] parti başarısız (cli_failed): oturum yok")).toBe(true);
    expect(isPersistentLlmFailureLine("[2/3] parti başarısız (invalid_output): şema")).toBe(false);
    expect(isPersistentLlmFailureLine("[1/3] 8 etiket (8 kanıtı doğrulandı), 0 belirsiz")).toBe(false);
  });

  it("tapLlmFailure satırı olduğu gibi iletir ve işaretler", () => {
    const seen: string[] = [];
    const tap = tapLlmFailure((line) => seen.push(line));
    tap.log("normal satır");
    expect(tap.tripped).toBe(false);
    tap.log("[1/1] parti başarısız (cli_failed): limit dolu");
    expect(tap.tripped).toBe(true);
    expect(seen).toHaveLength(2);
  });
});
