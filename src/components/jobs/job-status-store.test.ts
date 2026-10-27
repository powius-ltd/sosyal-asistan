import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_SCOPE, QUEUED_JOB, RUNNING_JOB, seedOf, SUCCEEDED_JOB, viewOf } from "@/components/jobs/job-fixtures";
import { JobStatusStore, type JobStatusStoreDeps } from "@/components/jobs/job-status-store";
import { JOB_KICK_MIN_INTERVAL_MS, JOB_POLL_INTERVAL_MS } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";

const IDLE: JobsStatusResponse = { workerNeeded: false };
const RUNNING = viewOf(RUNNING_JOB);
const DONE = viewOf({ ...RUNNING_JOB, status: "succeeded", finishedAt: "2026-10-05T12:05:00.000Z" });

/** Sahte tarayıcı: görünürlük elle değişir, zamanlayıcılar vitest'in sahte saatindedir. */
function setup(responses: JobsStatusResponse[] = []) {
  let visible = true;
  let onVisibility: (() => void) | undefined;
  const fetchStatus = vi.fn(async (jobId: string | undefined) => {
    void jobId;
    return responses.shift() ?? IDLE;
  });
  const deps: JobStatusStoreDeps = {
    fetchStatus,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    isVisible: () => visible,
    onVisibilityChange: (listener) => {
      onVisibility = listener;
      return () => {
        onVisibility = undefined;
      };
    },
  };
  const store = new JobStatusStore(deps);
  const changes = vi.fn();
  const unsubscribe = store.subscribe(changes);
  return {
    store,
    fetchStatus,
    changes,
    unsubscribe,
    responses,
    setVisible(next: boolean) {
      visible = next;
      onVisibility?.();
    },
    hasVisibilityListener: () => onVisibility !== undefined,
  };
}

const tick = (ms: number = JOB_POLL_INTERVAL_MS) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("JobStatusStore: yoklama kuralları", () => {
  it("etkin iş yokken HİÇ yoklamaz", async () => {
    const { store, fetchStatus } = setup();
    store.seed(FIXTURE_SCOPE, IDLE);
    await tick(60_000);
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(store.getSnapshot().active).toBeUndefined();
  });

  it("etkin iş varken aralıkla yoklar; işin kimliğiyle sorar ve durumu günceller", async () => {
    const next = { ...RUNNING, progress: { done: 8, total: 19 } };
    const { store, fetchStatus } = setup([{ active: next, job: next, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    expect(fetchStatus).not.toHaveBeenCalled();
    await tick(JOB_POLL_INTERVAL_MS - 1);
    expect(fetchStatus).not.toHaveBeenCalled();
    await tick(1);
    expect(fetchStatus).toHaveBeenCalledExactlyOnceWith(RUNNING.id);
    expect(store.getSnapshot().active?.progress).toEqual({ done: 8, total: 19 });
  });

  it("sekme gizliyken yoklamaz; görününce HEMEN bir kez okur ve aralığa döner", async () => {
    const { store, fetchStatus, setVisible } = setup([
      { active: RUNNING, workerNeeded: false },
      { active: RUNNING, workerNeeded: false },
    ]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    setVisible(false);
    await tick(60_000);
    expect(fetchStatus).not.toHaveBeenCalled();
    setVisible(true);
    await tick(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("dinleyen kalmayınca durur (zamanlayıcı ve görünürlük aboneliği kalkar)", async () => {
    const { store, fetchStatus, unsubscribe, hasVisibilityListener } = setup();
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    unsubscribe();
    expect(hasVisibilityListener()).toBe(false);
    await tick(60_000);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("ağ hatasında durum korunur, sıradaki yoklama yeniden dener", async () => {
    const { store, fetchStatus } = setup();
    fetchStatus.mockRejectedValueOnce(new Error("ağ yok"));
    fetchStatus.mockResolvedValueOnce({ active: RUNNING, workerNeeded: false });
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    expect(store.getSnapshot().active?.id).toBe(RUNNING.id);
    await tick();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
});

describe("JobStatusStore: arka plan yoklaması (uzun başlangıç işi)", () => {
  it("açıkken gizli sekmede de yoklar; bitişi görür", async () => {
    const { store, fetchStatus, setVisible } = setup([
      { active: RUNNING, workerNeeded: false },
      { job: DONE, workerNeeded: false },
    ]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    store.setBackgroundPolling(true);
    setVisible(false);
    await tick();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().lastFinished?.status).toBe("succeeded");
  });

  it("kapatılınca gizli sekmede yeniden durur", async () => {
    const { store, fetchStatus, setVisible } = setup([{ active: RUNNING, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    store.setBackgroundPolling(true);
    setVisible(false);
    store.setBackgroundPolling(false);
    await tick(60_000);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("izlenecek iş yoksa açık olsa da yoklamaz", async () => {
    const { store, fetchStatus, setVisible } = setup();
    store.seed(FIXTURE_SCOPE, IDLE);
    store.setBackgroundPolling(true);
    setVisible(false);
    await tick(60_000);
    expect(fetchStatus).not.toHaveBeenCalled();
  });
});

describe("JobStatusStore: bitiş", () => {
  it("iş bitince: son görünüm saklanır, bitiş dinleyicisi BİR kez çağrılır, yoklama durur", async () => {
    const { store, fetchStatus } = setup([{ job: DONE, workerNeeded: false }]);
    const finished = vi.fn();
    store.onFinish(finished);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    const snapshot = store.getSnapshot();
    expect(snapshot.active).toBeUndefined();
    expect(snapshot.lastFinished?.status).toBe("succeeded");
    expect(snapshot.settled[RUNNING.id]?.status).toBe("succeeded");
    expect(finished).toHaveBeenCalledTimes(1);
    await tick(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("son görünümü okunamadan biten iş: bitiş yine bildirilir, uydurma sonuç satırı yazılmaz", async () => {
    const { store } = setup([IDLE]);
    const finished = vi.fn();
    store.onFinish(finished);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().lastFinished).toBeUndefined();
    expect(store.getSnapshot().settled).toEqual({});
  });

  it("sunucu 'etkin iş yok' diye tohumlarsa bitiş VARSAYILMAZ: yoklama son görünümle çözer", async () => {
    const { store, fetchStatus } = setup([{ job: DONE, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    store.seed(FIXTURE_SCOPE, IDLE);
    expect(store.getSnapshot().active?.id).toBe(RUNNING.id);
    await tick(0);
    expect(fetchStatus).toHaveBeenCalledExactlyOnceWith(RUNNING.id);
    expect(store.getSnapshot().lastFinished?.id).toBe(RUNNING.id);
  });

  it("bittiği bilinen iş bayat tohumla yeniden etkin sayılmaz", async () => {
    const { store, fetchStatus } = setup([{ job: DONE, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    expect(store.getSnapshot().active).toBeUndefined();
    await tick(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("durum ucunun tanımadığı iş yeniden tohumlanırsa izlenmez (çizim ↔ durum ucu anlaşmazlığında yenileme döngüsü olmaz)", async () => {
    const { store, fetchStatus } = setup([IDLE]);
    const finished = vi.fn();
    store.onFinish(finished);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    expect(finished).toHaveBeenCalledTimes(1);
    for (let round = 0; round < 3; round += 1) {
      store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
      await tick(60_000);
    }
    expect(store.getSnapshot().active).toBeUndefined();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    // Başka çalışma alanına geçip dönünce kayıt sıfırlanır: iş yeniden izlenebilir.
    store.seed("ws_baska", IDLE);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    expect(store.getSnapshot().active?.id).toBe(RUNNING.id);
  });

  it("sonuç satırı kapatılabilir; yeni iş istenince de düşer", async () => {
    const { store } = setup([{ job: DONE, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    store.dismissFinished();
    expect(store.getSnapshot().lastFinished).toBeUndefined();
    expect(store.getSnapshot().settled[RUNNING.id]).toBeDefined();
  });
});

describe("JobStatusStore: bu sekmeden istenen iş", () => {
  it("follow: hemen okur; iş etkinse izlemeye devam eder", async () => {
    const queued = viewOf(QUEUED_JOB);
    const { store, fetchStatus } = setup([{ active: queued, job: queued, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, IDLE);
    store.follow(queued.id);
    expect(store.getSnapshot().pendingId).toBe(queued.id);
    await tick(0);
    expect(fetchStatus).toHaveBeenCalledExactlyOnceWith(queued.id);
    expect(store.getSnapshot()).toMatchObject({ active: { id: queued.id } });
    expect(store.getSnapshot().pendingId).toBeUndefined();
    await tick();
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("follow: iş ilk okumada bitmişse sonucu saklanır ve bitiş bildirilir", async () => {
    const done = viewOf(SUCCEEDED_JOB);
    const { store } = setup([{ job: done, workerNeeded: false }]);
    const finished = vi.fn();
    store.onFinish(finished);
    store.seed(FIXTURE_SCOPE, IDLE);
    store.follow(done.id);
    await tick(0);
    expect(store.getSnapshot().settled[done.id]).toEqual(done);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("follow: yanıtta iş yoksa beklemede KALMAZ ve yoklama durur", async () => {
    const { store, fetchStatus } = setup([IDLE]);
    store.seed(FIXTURE_SCOPE, IDLE);
    store.follow("job_yok");
    await tick(0);
    expect(store.getSnapshot().pendingId).toBeUndefined();
    await tick(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});

describe("JobStatusStore: çalışma alanı ve işçi dürtme", () => {
  it("başka çalışma alanıyla tohumlanınca önceki alanın işi ve sonucu taşınmaz", async () => {
    const { store } = setup([{ job: DONE, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    await tick();
    store.seed("ws_baska", IDLE);
    expect(store.getSnapshot()).toEqual({ scope: "ws_baska", settled: {}, workerNeeded: false });
  });

  it("yanıt beklenirken çalışma alanı değişirse eski alanın yanıtı uygulanmaz", async () => {
    const { store } = setup([{ active: { ...RUNNING, progress: { done: 9, total: 19 } }, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    store.refresh();
    store.seed("ws_baska", IDLE);
    await tick(0);
    expect(store.getSnapshot().active).toBeUndefined();
  });

  it("işçi gerekiyorsa dürter; aynı sekme en çok JOB_KICK_MIN_INTERVAL_MS'te bir dürter", async () => {
    const waiting = { active: viewOf(QUEUED_JOB), workerNeeded: true } satisfies JobsStatusResponse;
    const { store, responses } = setup();
    const kick = vi.fn();
    store.setKick(kick);
    store.seed(FIXTURE_SCOPE, waiting);
    expect(kick).toHaveBeenCalledTimes(1);
    for (let elapsed = 0; elapsed < JOB_KICK_MIN_INTERVAL_MS - JOB_POLL_INTERVAL_MS; elapsed += JOB_POLL_INTERVAL_MS) {
      responses.push(waiting);
      await tick();
    }
    expect(kick).toHaveBeenCalledTimes(1);
    responses.push(waiting, waiting);
    await tick();
    await tick();
    expect(kick).toHaveBeenCalledTimes(2);
  });

  it("dürtücü bağlı değilse (müşteri görünümü) işçi dürtülmez; sonradan bağlanınca bekleyen iş için dürtülür", () => {
    const { store } = setup();
    store.seed(FIXTURE_SCOPE, { active: viewOf(QUEUED_JOB), workerNeeded: true });
    const kick = vi.fn();
    store.setKick(kick);
    expect(kick).toHaveBeenCalledTimes(1);
    store.setKick(undefined);
  });

  it("aynı durum yeniden gelirse dinleyiciler boşuna uyarılmaz", async () => {
    const { store, changes } = setup([{ active: RUNNING, workerNeeded: false }]);
    store.seed(FIXTURE_SCOPE, seedOf(RUNNING_JOB).status);
    const calls = changes.mock.calls.length;
    await tick();
    expect(changes.mock.calls.length).toBe(calls);
  });
});
