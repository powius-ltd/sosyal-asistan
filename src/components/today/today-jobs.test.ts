import { beforeEach, describe, expect, it, vi } from "vitest";

const loadJobsState = vi.hoisted(() => vi.fn());
vi.mock("@/components/jobs/jobs-state", () => ({ loadJobsState }));

import { loadTodayJobs } from "@/components/today/today-jobs";

/** `loadJobsState()` sonucunun bu dosyanın okuduğu kısmı. */
const state = (canRun: boolean, active?: { stale: boolean }) => ({ canRun, seed: { scope: "ws", status: { workerNeeded: false, ...(active ? { active } : {}) } } });

beforeEach(() => loadJobsState.mockReset());

describe("loadTodayJobs", () => {
  it("müşteri modunda iş durumu hiç okunmaz", async () => {
    expect(await loadTodayJobs(false)).toBeUndefined();
    expect(loadJobsState).not.toHaveBeenCalled();
  });

  it("kapıyı ve etkin işi aktarır: etkin iş yoksa boş, sırada / çalışan iş varsa dolu", async () => {
    loadJobsState.mockResolvedValueOnce(state(true));
    expect(await loadTodayJobs(true)).toEqual({ canRun: true, busy: false });
    loadJobsState.mockResolvedValueOnce(state(true, { stale: false }));
    expect(await loadTodayJobs(true)).toEqual({ canRun: true, busy: true });
    loadJobsState.mockResolvedValueOnce(state(false));
    expect(await loadTodayJobs(true)).toEqual({ canRun: false, busy: false });
  });

  it("yanıt vermeyen iş engel sayılmaz (yeni istek onu kapatır)", async () => {
    loadJobsState.mockResolvedValueOnce(state(true, { stale: true }));
    expect(await loadTodayJobs(true)).toEqual({ canRun: true, busy: false });
  });

  it("okuma fırlatırsa undefined döner (kart üretilmez, sayfa çökmez)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    loadJobsState.mockRejectedValueOnce(new Error("bağlantı yok"));
    expect(await loadTodayJobs(true)).toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
