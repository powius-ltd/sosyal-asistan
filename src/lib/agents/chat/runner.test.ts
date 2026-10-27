import { describe, expect, it } from "vitest";

import { ChatAbortedError, createChatRunner } from "@/lib/agents/chat/runner";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import type { SubprocessOptions } from "@/lib/llm/subprocess";

const call: SubprocessOptions = { command: "claude", args: ["-p"], input: "girdi", timeoutMs: 90_000 };

function clock(start = 0) {
  const state = { ms: start };
  return { state, now: () => state.ms };
}

describe("sohbet alt süreç çalıştırıcısı", () => {
  it("normal çağrıyı geçirir; seçenekleri korur", async () => {
    const fake = createFakeSubprocess({ stdout: "tamam" });
    const runner = createChatRunner({ base: fake.runner, totalMs: 90_000, now: clock().now });
    const result = await runner(call);
    expect(result.stdout).toBe("tamam");
    expect(fake.calls[0]).toMatchObject({ command: "claude", args: ["-p"], input: "girdi" });
  });

  it("toplam süre tavanı: her çağrının zaman aşımı kalan süreye indirilir (düzeltme turu ilk çağrının süresini yer)", async () => {
    const time = clock();
    const fake = createFakeSubprocess(() => {
      time.state.ms += 60_000; // ilk çağrı 60 sn sürdü
      return {};
    });
    const runner = createChatRunner({ base: fake.runner, totalMs: 90_000, now: time.now });
    await runner(call);
    await runner(call);
    expect(fake.calls[0].timeoutMs).toBe(90_000);
    expect(fake.calls[1].timeoutMs).toBe(30_000); // 90 − 60
  });

  it("süre bittiyse süreç HİÇ başlatılmaz; zaman aşımı sonucu döner (istemci timeout hatasına çevirir)", async () => {
    const time = clock();
    const fake = createFakeSubprocess();
    const runner = createChatRunner({ base: fake.runner, totalMs: 90_000, now: time.now });
    time.state.ms = 90_001;
    const result = await runner(call);
    expect(result).toMatchObject({ timedOut: true, exitCode: null });
    expect(fake.calls).toHaveLength(0);
  });

  it("iptal edilmişse yeni süreç başlatılmaz (ChatAbortedError)", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = createFakeSubprocess();
    const runner = createChatRunner({ base: fake.runner, signal: controller.signal, totalMs: 90_000 });
    await expect(runner(call)).rejects.toBeInstanceOf(ChatAbortedError);
    expect(fake.calls).toHaveLength(0);
  });

  it("süreç sürerken iptal edilirse sonuç atılır (yanıt yazılmaz)", async () => {
    const controller = new AbortController();
    const fake = createFakeSubprocess(() => {
      controller.abort();
      return { stdout: "geç kalan yanıt" };
    });
    const runner = createChatRunner({ base: fake.runner, signal: controller.signal, totalMs: 90_000 });
    await expect(runner(call)).rejects.toBeInstanceOf(ChatAbortedError);
  });

  it("iptal sinyali alt çalıştırıcıya iletilir (süreci öldürebilen çalıştırıcı için)", async () => {
    const controller = new AbortController();
    const fake = createFakeSubprocess();
    await createChatRunner({ base: fake.runner, signal: controller.signal, totalMs: 90_000 })(call);
    expect(fake.calls[0].signal).toBe(controller.signal);
  });
});
