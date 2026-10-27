import { describe, expect, it, vi } from "vitest";

import { JOB_LOG_RETENTION_MS } from "@/lib/job-runner/job-store";
import { claimedJob, fakeDeps, fakeStore, NOW, WORKER_ID } from "@/lib/job-runner/test-support";
import { newWorkerId, runWorker, WORKER_EXIT } from "@/lib/job-runner/worker";

const QUEUE = "test_queue";
const base = { queue: QUEUE, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 };
const job = (n: number, kind: "analyze" | "label" = "analyze") => claimedJob({ id: `33333333-3333-4333-8333-33333333330${n}`, kind });

describe("işçi döngüsü: drain", () => {
  it("boş kuyrukta 0 ile çıkar: tek claim, iş koşturulmaz; başlangıç bakımı yapılır", async () => {
    const fake = fakeStore();
    const deps = fakeDeps();
    const sweepTemp = vi.fn(() => 2);
    const log: string[] = [];
    const result = await runWorker({ ...base, mode: "drain", store: fake.store, deps, sweepTemp, log: (line) => log.push(line) });
    expect(result).toEqual({ code: WORKER_EXIT.drained, jobs: 0, reason: "drained" });
    expect(result.code).toBe(0);
    expect(fake.store.claim).toHaveBeenCalledTimes(1);
    expect(fake.store.claim).toHaveBeenCalledWith(QUEUE, WORKER_ID);
    expect(fake.store.patch).not.toHaveBeenCalled();
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(sweepTemp).toHaveBeenCalledTimes(1);
    expect(fake.store.clearOldLogTails).toHaveBeenCalledWith(QUEUE, new Date(NOW.getTime() - JOB_LOG_RETENTION_MS));
    expect(log.join("\n")).toContain("Eski geçici klasör temizlendi: 2");
  });

  it("sıradaki işleri sırayla koşturur, kuyruk boşalınca çıkar; her iş kendi kapanışını yazar", async () => {
    const fake = fakeStore([job(1), job(2, "label")]);
    const deps = fakeDeps();
    const result = await runWorker({ ...base, mode: "drain", store: fake.store, deps });
    expect(result).toEqual({ code: 0, jobs: 2, reason: "drained" });
    expect(fake.store.claim).toHaveBeenCalledTimes(3);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
    expect(deps.label).toHaveBeenCalledTimes(1);
    expect(fake.patches.filter((patch) => patch.status !== undefined).map((patch) => patch.status)).toEqual(["succeeded", "succeeded"]);
    const refs = vi.mocked(fake.store.patch).mock.calls.map(([ref]) => ref.id);
    expect(new Set(refs)).toEqual(new Set([job(1).id, job(2).id]));
  });

  it("başlangıç bakımı düşerse işçi yine çalışır", async () => {
    const fake = fakeStore([job(1)]);
    vi.mocked(fake.store.clearOldLogTails).mockRejectedValueOnce(new Error("Eski iş günlükleri temizlenemedi: ağ"));
    const log: string[] = [];
    const result = await runWorker({
      ...base,
      mode: "drain",
      store: fake.store,
      deps: fakeDeps(),
      sweepTemp: () => {
        throw new Error("erişim reddedildi");
      },
      log: (line) => log.push(line),
    });
    expect(result).toMatchObject({ code: 0, jobs: 1 });
    expect(log.filter((line) => line.startsWith("Uyarı"))).toHaveLength(2);
  });
});

describe("işçi döngüsü: durma", () => {
  it("nabız / yazım 0 satır etkilerse işçi DURUR: sıradaki işi almaz, çıkış 3", async () => {
    const fake = fakeStore([job(1), job(2)]);
    fake.loseFence();
    const deps = fakeDeps();
    const result = await runWorker({ ...base, mode: "drain", store: fake.store, deps });
    expect(result).toEqual({ code: WORKER_EXIT.stopped, jobs: 1, reason: "lost" });
    expect(fake.store.claim, "ikinci iş alınmadı").toHaveBeenCalledTimes(1);
    expect(deps.analyze, "adım başlamadı").not.toHaveBeenCalled();
    expect(fake.patches).toEqual([]);
  });

  it("nabız zamanlayıcısı çit kaybını iş sürerken yakalar: kalan videolar başlamaz", async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeStore([job(1)]);
      const started: number[] = [];
      const deps = fakeDeps({
        analyze: async (_ctx, args) => {
          for (let video = 1; video <= 3; video++) {
            if ((await args.shouldStop?.()) === true) break;
            started.push(video);
            if (video === 1) fake.loseFence(); // iş başka yerden kapatıldı; işçi bunu ancak sonraki yazımda (nabız) öğrenir
            await new Promise((resolve) => setTimeout(resolve, 30_000));
          }
          return { outcome: "completed", selected: 3, ok: started.length, insufficient: 0, failed: 0, skippedByCap: 3 - started.length, expired: 0, missing: 0, agyCalls: 0, screening: { screened: 0, offNiche: 0, unscreenable: 0, unsure: 0, failed: 0 }, seconds: 1 };
        },
      });
      const running = runWorker({ ...base, heartbeatMs: 10_000, mode: "drain", store: fake.store, deps });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await running).toMatchObject({ code: WORKER_EXIT.stopped, reason: "lost" });
      expect(started).toEqual([1]);
      expect(fake.closing()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sert süre tavanında işçi yeni iş almadan durur (çıkış 3)", async () => {
    const fake = fakeStore([job(1, "label"), job(2)]);
    const deps = fakeDeps({ label: () => new Promise(() => undefined) });
    const result = await runWorker({ ...base, mode: "drain", store: fake.store, deps, timeoutMs: 5, hardGraceMs: 5 });
    expect(result).toEqual({ code: WORKER_EXIT.stopped, jobs: 1, reason: "abandoned" });
    expect(fake.store.claim).toHaveBeenCalledTimes(1);
    expect(fake.closing()).toMatchObject({ status: "failed", result: { outcome: "timeout" } });
  });
});

describe("işçi döngüsü: watch", () => {
  it("iş yokken bekleyip yoklar; iş gelince koşturur; sinyalle iş aralarında çıkar", async () => {
    const fake = fakeStore();
    const controller = new AbortController();
    const waits: number[] = [];
    let polls = 0;
    vi.mocked(fake.store.claim).mockImplementation(async () => (++polls === 3 ? job(1) : undefined));
    const sleep = async (ms: number) => {
      waits.push(ms);
      if (polls >= 4) controller.abort();
    };
    const deps = fakeDeps();
    const result = await runWorker({ ...base, mode: "watch", store: fake.store, deps, sleep, pollMs: 250, signal: controller.signal });
    expect(result).toEqual({ code: 0, jobs: 1, reason: "aborted" });
    expect(waits).toEqual([250, 250, 250]);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
  });
});

describe("işçi kimliği", () => {
  it("DB biçimine uyar ve her işçide farklıdır", () => {
    const ids = [newWorkerId(), newWorkerId(4242)];
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9._:-]{1,80}$/);
    expect(ids[1]).toContain("-4242-");
    expect(new Set(ids).size).toBe(2);
  });
});
