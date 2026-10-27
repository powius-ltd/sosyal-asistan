import { describe, expect, it, vi } from "vitest";

import { RepositoryError } from "@/lib/data/repository";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { Workspace } from "@/lib/domain/run";
import { JobApprovalRefused, requestJobChecked, requestRoutineForAll, type JobRequestRepo } from "@/lib/job-control/request";

const job = (id: string, workspaceId: string): PanelJob => ({
  id,
  workspaceId,
  queue: "test-k",
  kind: "routine",
  dryRun: false,
  params: {},
  status: "queued",
  steps: [],
  createdAt: "2026-10-05T09:00:00.000Z",
});

/** Sahte depo: çalışma alanı tavanları verilir; `requestJob` çağrıları kaydedilir. */
function fakeRepo(caps: Partial<Workspace> | null = { apifyMonthlyCapUsd: 10 }) {
  const requestJob = vi.fn<JobRequestRepo["requestJob"]>(async (wsId) => job(`job-${wsId}`, wsId));
  const getWorkspace = vi.fn<JobRequestRepo["getWorkspace"]>(async () => caps as Workspace | null);
  return { requestJob, getWorkspace };
}

describe("requestJobChecked", () => {
  it("onaysız istekte çalışma alanı okunmaz; iş verilen çalışma alanına yazılır", async () => {
    const repo = fakeRepo();
    expect((await requestJobChecked(repo, "ws-a", { kind: "plan", week: "2026-10-12" })).id).toBe("job-ws-a");
    expect(repo.getWorkspace).not.toHaveBeenCalled();
    expect(repo.requestJob).toHaveBeenCalledExactlyOnceWith("ws-a", { kind: "plan", week: "2026-10-12" });
  });

  it("onay çalışma alanının tavan durumunda geçerliyse iş yazılır", async () => {
    const repo = fakeRepo({ apifyMonthlyCapUsd: 10 });
    const input = { kind: "collect", approval: { basis: "one_time", maxUsd: 0.2 } } as const;
    await requestJobChecked(repo, "ws-a", input);
    expect(repo.requestJob).toHaveBeenCalledExactlyOnceWith("ws-a", input);
  });

  it("harcama kapalıyken (aylık tavan 0) onay reddedilir: neden söylenir, satır yazılmaz", async () => {
    const repo = fakeRepo({ apifyMonthlyCapUsd: 0 });
    const attempt = requestJobChecked(repo, "ws-a", { kind: "collect", approval: { basis: "one_time", maxUsd: 0.2 } });
    await expect(attempt).rejects.toBeInstanceOf(JobApprovalRefused);
    await expect(attempt).rejects.toThrow(/harcama şu an kapalı/);
    expect(repo.requestJob).not.toHaveBeenCalled();
  });

  it("ölçümde aylık tavan onaysızken 'aylık tavan içinde' onayı reddedilir; tavan onaylıysa geçer", async () => {
    const unapproved = fakeRepo({ apifyMonthlyCapUsd: 10 });
    await expect(requestJobChecked(unapproved, "ws-a", { kind: "measure", approval: { basis: "monthly_cap" } })).rejects.toThrow(/Aylık tavan onaylı değil/);
    expect(unapproved.requestJob).not.toHaveBeenCalled();

    const approved = fakeRepo({ apifyMonthlyCapUsd: 10, measureMonthlyCapUsd: 1 });
    await requestJobChecked(approved, "ws-a", { kind: "measure", approval: { basis: "monthly_cap" } });
    expect(approved.requestJob).toHaveBeenCalledOnce();
  });

  it("çalışma alanı yoksa karar deponundur (depo hatası olduğu gibi çıkar)", async () => {
    const repo = fakeRepo(null);
    repo.requestJob.mockRejectedValueOnce(new RepositoryError("not_found", "yok"));
    await expect(requestJobChecked(repo, "ws-yok", { kind: "collect", approval: { basis: "one_time", maxUsd: 0.2 } })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("requestRoutineForAll", () => {
  const request = { dryRun: true };

  it("her çalışma alanına sırayla bir haftalık tur yazar; geçerli çalışma alanının işini döndürür", async () => {
    const repo = fakeRepo();
    const outcome = await requestRoutineForAll({ repo, workspaceIds: ["ws-a", "ws-b", "ws-c"], currentWsId: "ws-b", request });
    expect(outcome).toEqual({ requested: 3, skipped: 0, failed: 0, jobId: "job-ws-b" });
    expect(repo.requestJob.mock.calls.map(([wsId, input]) => [wsId, input])).toEqual([
      ["ws-a", { kind: "routine", dryRun: true }],
      ["ws-b", { kind: "routine", dryRun: true }],
      ["ws-c", { kind: "routine", dryRun: true }],
    ]);
  });

  it("etkin işi olan atlanır, başka hata sayılır; kalanlar yine denenir ve hiçbir durumda fırlatmaz", async () => {
    const repo = fakeRepo();
    const boom = new Error("bağlantı koptu");
    repo.requestJob.mockImplementation(async (wsId) => {
      if (wsId === "ws-a") throw new RepositoryError("already_exists", "etkin iş var");
      if (wsId === "ws-b") throw boom;
      return job(`job-${wsId}`, wsId);
    });
    const outcome = await requestRoutineForAll({ repo, workspaceIds: ["ws-a", "ws-b", "ws-c"], currentWsId: "ws-a", request });
    expect(outcome).toEqual({ requested: 1, skipped: 1, failed: 1, firstError: boom });
    expect(outcome.jobId).toBeUndefined(); // geçerli çalışma alanında açılamadı
  });

  it("onay çalışma alanı BAŞINA denetlenir: harcaması kapalı olan açılamaz, diğerleri açılır", async () => {
    const repo = fakeRepo();
    repo.getWorkspace.mockImplementation(async (wsId) => ({ apifyMonthlyCapUsd: wsId === "ws-b" ? 0 : 10 }) as Workspace);
    const outcome = await requestRoutineForAll({
      repo,
      workspaceIds: ["ws-a", "ws-b"],
      currentWsId: "ws-a",
      request: { approval: { basis: "one_time", maxUsd: 0.2 } },
    });
    expect(outcome).toMatchObject({ requested: 1, skipped: 0, failed: 1, jobId: "job-ws-a" });
    expect(outcome.firstError).toBeInstanceOf(JobApprovalRefused);
    expect(repo.requestJob).toHaveBeenCalledExactlyOnceWith("ws-a", { kind: "routine", approval: { basis: "one_time", maxUsd: 0.2 } });
  });

  it("çalışma alanı yoksa hiçbir şey yazılmaz", async () => {
    const repo = fakeRepo();
    expect(await requestRoutineForAll({ repo, workspaceIds: [], currentWsId: "ws-a", request })).toEqual({ requested: 0, skipped: 0, failed: 0 });
    expect(repo.requestJob).not.toHaveBeenCalled();
  });
});
