import { afterEach, describe, expect, it, vi } from "vitest";

import { JOB_ERROR_MAX_CHARS, JOB_HEARTBEAT_INTERVAL_MS, JOB_LOG_TAIL_MAX_CHARS, type JobResult } from "@/lib/domain/panel-job";
import { createJobSession } from "@/lib/job-runner/job-session";
import { claimedJob, fakeStore, NOW, WORKER_ID } from "@/lib/job-runner/test-support";

function open(options: { softDeadline?: Date; clock?: () => Date } = {}) {
  const fake = fakeStore();
  const echo: string[] = [];
  const session = createJobSession({
    store: fake.store,
    job: claimedJob(),
    workerId: WORKER_ID,
    softDeadline: options.softDeadline ?? new Date(NOW.getTime() + 60_000),
    clock: options.clock ?? (() => NOW),
    echo: (line) => echo.push(line),
    retryDelayMs: 0,
  });
  return { fake, session, echo };
}

afterEach(() => vi.useRealTimers());

describe("iş oturumu: çitli yazım", () => {
  it("her yazım işin kimliği + işçisiyle gider ve nabzı tazeler", async () => {
    const { fake, session } = open();
    await session.setSteps([{ id: "analyze", status: "pending" }]);
    await session.startStep("analyze");
    await session.setProgress({ done: 1, total: 3 });
    expect(fake.store.patch).toHaveBeenCalledTimes(3);
    for (const [ref, patch] of vi.mocked(fake.store.patch).mock.calls) {
      expect(ref).toEqual({ id: session.job.id, workerId: WORKER_ID });
      expect(patch.heartbeat_at).toBe(NOW.toISOString());
    }
    expect(fake.patches[1]).toMatchObject({ steps: [{ id: "analyze", status: "running" }], current_step: "analyze", progress: null });
    expect(fake.patches[2]).toMatchObject({ progress: { done: 1, total: 3 } });
  });

  it("0 satır (çit) → lost: sonraki HİÇBİR yazım depoya gitmez, kapanış yazılmaz", async () => {
    const { fake, session, echo } = open();
    await session.setSteps([{ id: "analyze", status: "pending" }]);
    fake.loseFence();
    await session.beat();
    expect(session.stopReason()).toBe("lost");
    expect(session.shouldStop()).toBe(true);
    const calls = vi.mocked(fake.store.patch).mock.calls.length;
    await session.startStep("analyze");
    await session.setProgress({ done: 1, total: 2 });
    expect(await session.finish({ status: "succeeded" })).toBe(false);
    expect(fake.store.patch).toHaveBeenCalledTimes(calls);
    expect(fake.rejected).toBe(1);
    expect(fake.closing()).toBeUndefined();
    expect(echo.join("\n")).toContain("Çit");
  });

  it("iptal isteği yazımın yanıtından okunur; çit kaybı iptalden önce gelir", async () => {
    const { fake, session } = open();
    await session.beat();
    expect(session.stopReason()).toBeUndefined();
    fake.requestCancel();
    await session.beat();
    expect(session.stopReason()).toBe("cancelled");
    fake.loseFence();
    await session.beat();
    expect(session.stopReason()).toBe("lost");
  });

  it("süre tavanı (yumuşak): sınırdan sonra timeout der; iptal istenmişse cancelled öncelikli", async () => {
    let now = NOW;
    const { fake, session } = open({ softDeadline: new Date(NOW.getTime() + 1000), clock: () => now });
    expect(session.shouldStop()).toBe(false);
    now = new Date(NOW.getTime() + 1000);
    expect(session.stopReason()).toBe("timeout");
    fake.requestCancel();
    await session.beat();
    expect(session.stopReason()).toBe("cancelled");
  });

  it("geçici DB hatası işi düşürmez (uyarı yazılır, sonraki yazım dener)", async () => {
    const { fake, session, echo } = open();
    vi.mocked(fake.store.patch).mockRejectedValueOnce(new Error("bağlantı koptu"));
    await session.beat();
    expect(session.stopReason()).toBeUndefined();
    expect(echo.join("\n")).toContain("bağlantı koptu");
    await session.beat();
    expect(fake.patches).toHaveLength(1);
  });
});

describe("iş oturumu: adımlar ve günlük", () => {
  it("adım kapanınca sayaç ve çalışan adım boşalır; not sınırı aşmaz; bilinmeyen tutar yazılmaz", async () => {
    const { fake, session } = open();
    await session.startStep("collect");
    await session.setProgress({ done: 5, total: 3 });
    expect(fake.patches.at(-1)?.progress, "yapılan toplamı aşamaz").toEqual({ done: 3, total: 3 });
    await session.finishStep("collect", { status: "ok", note: "x".repeat(900), seconds: 1.2, spend: { estimateUsd: 0.1, actualUsd: undefined } });
    const last = fake.patches.at(-1);
    expect(last).toMatchObject({ current_step: null, progress: null });
    const [step] = last?.steps as { note: string; spend: object }[];
    expect(Array.from(step.note).length).toBe(500);
    expect(step.spend).toEqual({ estimateUsd: 0.1 });
  });

  it("günlük kuyruğu son satırları tutar (sınır: karakter) ve yazımla satıra gider", async () => {
    const { fake, session } = open();
    for (let i = 0; i < 400; i++) session.log(`satır ${i} ${"ğ".repeat(40)}`);
    await session.beat();
    const tail = fake.patches.at(-1)?.log_tail ?? "";
    expect(Array.from(tail).length).toBe(JOB_LOG_TAIL_MAX_CHARS);
    expect(tail.endsWith(`satır 399 ${"ğ".repeat(40)}`)).toBe(true);
  });

  it("nabız zamanlayıcısı aralıkla yazar; kapanıştan sonra yazmaz", async () => {
    vi.useFakeTimers();
    const { fake, session } = open();
    session.startHeartbeat();
    await vi.advanceTimersByTimeAsync(JOB_HEARTBEAT_INTERVAL_MS * 3);
    expect(fake.patches).toHaveLength(3);
    expect(await session.finish({ status: "succeeded", result: { exitCode: 0 } })).toBe(true);
    await vi.advanceTimersByTimeAsync(JOB_HEARTBEAT_INTERVAL_MS * 3);
    await session.beat();
    expect(fake.patches).toHaveLength(4);
  });
});

describe("iş oturumu: kapanış", () => {
  it("kapanış: durum + bitiş anı + sonuç; çalışan adım ve sayaç boş; hata metni sınırı aşmaz; undefined alan yazılmaz", async () => {
    const { fake, session } = open();
    await session.startStep("analyze");
    const written = await session.finish({ status: "failed", result: { outcome: "error", exitCode: undefined }, error: "h".repeat(JOB_ERROR_MAX_CHARS + 50) });
    expect(written).toBe(true);
    const closing = fake.closing();
    expect(closing).toMatchObject({ status: "failed", finished_at: NOW.toISOString(), current_step: null, progress: null, result: { outcome: "error" } });
    expect(Object.keys(closing?.result as object)).toEqual(["outcome"]);
    expect(Array.from(closing?.error ?? "").length).toBe(JOB_ERROR_MAX_CHARS);
  });

  it("kapanış geçici hatada yeniden denenir", async () => {
    const { fake, session } = open();
    vi.mocked(fake.store.patch).mockRejectedValueOnce(new Error("ağ")).mockRejectedValueOnce(new Error("ağ"));
    expect(await session.finish({ status: "succeeded" })).toBe(true);
    expect(fake.closing()?.status).toBe("succeeded");
  });

  it("sonuç yazma sözleşmesine uymuyorsa iş açık kalmaz: yalın failed kapanışı yazılır", async () => {
    const { fake, session } = open();
    const bad = { outcome: "uydurma_kod" } as unknown as JobResult;
    expect(await session.finish({ status: "succeeded", result: bad })).toBe(true);
    expect(fake.closing()).toMatchObject({ status: "failed", result: { outcome: "error" } });
    expect(fake.closing()?.error).toContain("İş sonucu yazılamadı");
  });
});
