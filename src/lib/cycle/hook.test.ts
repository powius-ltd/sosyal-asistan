import { describe, expect, it, vi } from "vitest";

import type { AdvanceParams, AdvanceResult } from "@/lib/cycle/advance";
import { isCycleAuto } from "@/lib/cycle/enabled";
import { createCycleHook, withCycleChain } from "@/lib/cycle/hook";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";
import { claimedJob, NOW, WS_ID } from "@/lib/job-runner/test-support";
import type { AdminClient } from "@/lib/supabase/admin";

const client = {} as AdminClient;
const final = { status: "succeeded" as const };
const stopped: AdvanceResult = { action: "stopped", stop: { reason: "complete", notify: false }, notified: false };

describe("CYCLE_AUTO anahtarı", () => {
  it("yalnız 'on' açar; tanımsız ve başka her değer kapalı", () => {
    expect(isCycleAuto({ CYCLE_AUTO: "on" })).toBe(true);
    expect(isCycleAuto({ CYCLE_AUTO: " ON " })).toBe(true);
    for (const value of [undefined, "", "off", "1", "true", "yes"]) expect(isCycleAuto({ CYCLE_AUTO: value })).toBe(false);
  });
});

describe("withCycleChain", () => {
  it("anahtar kapalıyken verilen kancayı AYNEN döndürür; zincir hiç kurulmaz ve çağrılmaz", async () => {
    const advance = vi.fn<(p: AdvanceParams) => Promise<AdvanceResult>>().mockResolvedValue(stopped);
    const base: JobFinishedHook = vi.fn(async () => undefined);
    for (const env of [{}, { CYCLE_AUTO: "off" }]) {
      const hook = withCycleChain(base, { client, env, advance });
      expect(hook).toBe(base);
    }
    expect(withCycleChain(undefined, { client, env: {}, advance })).toBeUndefined();
    await base(claimedJob(), final);
    expect(advance).not.toHaveBeenCalled();
  });

  it("anahtar açıkken önce bitiş bildirimi, sonra zincir çalışır; iş çalışma alanı ve kuyruğuyla", async () => {
    const order: string[] = [];
    const advance = vi.fn(async (p: AdvanceParams) => {
      order.push(`advance:${p.workspaceId}:${p.queue}`);
      return stopped;
    });
    const base: JobFinishedHook = async () => void order.push("base");
    const hook = withCycleChain(base, { client, env: { CYCLE_AUTO: "on" }, advance, clock: () => NOW });
    await hook?.(claimedJob({ queue: "kuyruk-x" }), final);
    expect(order).toEqual(["base", `advance:${WS_ID}:kuyruk-x`]);
  });
});

describe("createCycleHook", () => {
  it("kancanın hatası fırlamaz; günlüğe uyarı yazılır", async () => {
    const log = vi.fn();
    const hook = createCycleHook({ client, env: { CYCLE_AUTO: "on" }, log, advance: async () => { throw new Error("DB koptu"); } });
    await expect(hook(claimedJob(), final)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("DB koptu"));
  });

  it("kuru koşu (önizleme) zinciri tetiklemez", async () => {
    const advance = vi.fn(async () => stopped);
    await createCycleHook({ client, env: { CYCLE_AUTO: "on" }, advance })(claimedJob({ dryRun: true }), final);
    expect(advance).not.toHaveBeenCalled();
  });
});
