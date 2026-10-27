import { describe, expect, it, vi } from "vitest";

import { isAgentAuto } from "@/lib/agents/director/enabled";
import { withDirector } from "@/lib/agents/director/hook";
import type { DirectorTurnParams, DirectorTurnResult } from "@/lib/agents/director/turn";
import type { CycleHookOptions } from "@/lib/cycle/hook";
import type { AdvanceParams, AdvanceResult } from "@/lib/cycle/advance";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";
import { claimedJob, NOW, WS_ID } from "@/lib/job-runner/test-support";
import type { AdminClient } from "@/lib/supabase/admin";

const client = {} as AdminClient;
const final = { status: "succeeded" as const };
const idle: DirectorTurnResult = { outcome: "idle" };
const stopped: AdvanceResult = { action: "stopped", stop: { reason: "complete", notify: false }, notified: false };

describe("AGENT_AUTO anahtarı", () => {
  it("yalnız 'on' açar", () => {
    expect(isAgentAuto({ AGENT_AUTO: "on" })).toBe(true);
    for (const value of [undefined, "", "off", "1", "true"]) expect(isAgentAuto({ AGENT_AUTO: value })).toBe(false);
  });
});

describe("withDirector", () => {
  it("anahtar kapalıyken işçi davranışı aynı: CYCLE_AUTO kapalıysa kanca AYNEN, açıksa halka zinciri; ajan hiç çalışmaz", async () => {
    const turn = vi.fn<(p: DirectorTurnParams) => Promise<DirectorTurnResult>>().mockResolvedValue(idle);
    const advance = vi.fn<(p: AdvanceParams) => Promise<AdvanceResult>>().mockResolvedValue(stopped);
    const base: JobFinishedHook = vi.fn(async () => undefined);
    for (const env of [{}, { AGENT_AUTO: "off" }]) {
      expect(withDirector(base, { client, env, turn, advance } as CycleHookOptions & { turn: typeof turn })).toBe(base);
    }
    const chained = withDirector(base, { client, env: { CYCLE_AUTO: "on" }, turn, advance, clock: () => NOW });
    await chained?.(claimedJob(), final);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(turn).not.toHaveBeenCalled();
  });

  it("anahtar açıkken zincir yerine ajan turu çalışır (CYCLE_AUTO açık olsa bile zincir çalışmaz); önce bitiş bildirimi", async () => {
    const order: string[] = [];
    const turn = vi.fn(async (p: DirectorTurnParams) => {
      order.push(`turn:${p.workspaceId}:${p.queue}:${p.trigger}`);
      return idle;
    });
    const advance = vi.fn(async () => stopped);
    const base: JobFinishedHook = async () => void order.push("base");
    const hook = withDirector(base, { client, env: { AGENT_AUTO: "on", CYCLE_AUTO: "on" }, turn, advance, clock: () => NOW });
    await hook?.(claimedJob({ queue: "kuyruk-x" }), final);
    expect(order).toEqual(["base", `turn:${WS_ID}:kuyruk-x:job_finished`]);
    expect(advance).not.toHaveBeenCalled();
  });

  it("kuru koşu turu tetiklemez; turun hatası işi düşürmez, günlüğe yazılır", async () => {
    const turn = vi.fn(async () => {
      throw new Error("patladı");
    });
    const log = vi.fn();
    const hook = withDirector(undefined, { client, env: { AGENT_AUTO: "on" }, turn, log, clock: () => NOW });
    await hook?.(claimedJob({ dryRun: true }), final);
    expect(turn).not.toHaveBeenCalled();
    await expect(hook?.(claimedJob(), final)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ajan turu çalışmadı"));
  });
});
