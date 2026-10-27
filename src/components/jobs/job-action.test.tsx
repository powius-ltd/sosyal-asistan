import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ current: { available: true } as { available: true } | { available: false; reason: string } }));
vi.mock("@/lib/job-control/availability", () => ({ jobsAvailability: () => availability.current }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), kickWorkerAction: vi.fn(), requestRoutineForAllAction: vi.fn() }));

import { JobAction } from "@/components/jobs/job-action";
import type { JobRunContext } from "@/components/jobs/job-run-types";
import { JobStatusSlot } from "@/components/jobs/job-status-slot";
import type { JobStatusStripProps } from "@/components/jobs/job-status-strip";
import { JobStatusStrip } from "@/components/jobs/job-status-strip";
import { loadJobsState } from "@/components/jobs/jobs-state";
import { RunJobButton, type RunJobButtonProps } from "@/components/jobs/run-job-button";
import { getPanelContext } from "@/lib/data";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const FALLBACK = <code>yedek komut</code>;

function mode(operator: boolean) {
  vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
}

/** Örnek depoda bir iş açar (sırada kalır: örnek depoda işçi yoktur); test sonunda durdurulur. */
async function withQueuedJob<T>(run: (jobId: string) => Promise<T>): Promise<T> {
  const { repo, wsId } = await getPanelContext();
  const job = await repo.requestJob(wsId, { kind: "analyze" });
  try {
    return await run(job.id);
  } finally {
    await repo.cancelJob(wsId, job.id);
  }
}

beforeEach(() => {
  availability.current = { available: true };
  mode(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("loadJobsState (kapı)", () => {
  it("yönetici modu + ortam uygun → işler başlatılabilir", async () => {
    expect(await loadJobsState()).toMatchObject({ operator: true, canRun: true, seed: { scope: MOCK_WORKSPACE_ID, status: { workerNeeded: false } } });
    expect((await loadJobsState()).closed).toBeUndefined();
  });

  it("müşteri görünümü → kapalı (ortam uygun olsa bile)", async () => {
    mode(false);
    expect(await loadJobsState()).toMatchObject({ operator: false, canRun: false, closed: "customer" });
  });

  it("ortam uygun değilse (örnek veri, barındırma, işçi yok) → kapalı, nedeniyle", async () => {
    availability.current = { available: false, reason: "data_source" };
    expect(await loadJobsState()).toMatchObject({ operator: true, canRun: false, closed: "data_source" });
  });

  it("etkin iş görünümü yönetici moduna göre kurulur: müşteri görünümünde yönetici ayrıntısı HİÇ yok", async () => {
    await withQueuedJob(async (jobId) => {
      const operator = await loadJobsState();
      expect(operator.seed.status.active).toMatchObject({ id: jobId, status: "queued" });
      expect(operator.seed.status.active?.operator).toBeDefined();
      mode(false);
      const customer = await loadJobsState();
      expect(customer.seed.status.active).toMatchObject({ id: jobId, status: "queued" });
      expect(customer.seed.status.active).not.toHaveProperty("operator");
    });
  });
});

describe("JobStatusSlot (sunucu yuvası)", () => {
  it("etkin iş yokken de şeridi bağlar (yeni başlayan işi o izler); key = çalışma alanı", async () => {
    const element = await JobStatusSlot();
    expect(isValidElement(element)).toBe(true);
    const strip = element as ReactElement<JobStatusStripProps>;
    expect(strip.type).toBe(JobStatusStrip);
    expect(strip.key).toBe(MOCK_WORKSPACE_ID);
    expect(strip.props).toMatchObject({ operator: true, canKick: true, seed: { scope: MOCK_WORKSPACE_ID } });
    expect(strip.props.seed.status.active).toBeUndefined();
  });

  it("müşteri görünümünde de çizilir (herkes görür) ama işçi dürtemez ve yönetici ayrıntısı taşımaz", async () => {
    mode(false);
    await withQueuedJob(async (jobId) => {
      const strip = (await JobStatusSlot()) as ReactElement<JobStatusStripProps>;
      expect(strip.props).toMatchObject({ operator: false, canKick: false });
      expect(strip.props.seed.status.active?.id).toBe(jobId);
      expect(JSON.stringify(strip.props)).not.toMatch(/operator":\{|logTail|approval/);
    });
  });

  it("işler kapalıyken yönetici şeridi işçi dürtemez", async () => {
    availability.current = { available: false, reason: "hosted" };
    const strip = (await JobStatusSlot()) as ReactElement<JobStatusStripProps>;
    expect(strip.props).toMatchObject({ operator: true, canKick: false });
  });
});

describe("JobAction (sunucu sarmalayıcı)", () => {
  it("işler açıkken düğmeyi bağlamıyla çizer: iş durumu tohumu + harcama bilgisi", async () => {
    const element = await JobAction({ request: { kind: "plan" }, label: "Planı hazırla", variant: "default", fallback: FALLBACK });
    expect(isValidElement(element)).toBe(true);
    const button = element as ReactElement<RunJobButtonProps>;
    expect(button.type).toBe(RunJobButton);
    expect(button.props).toMatchObject({ request: { kind: "plan" }, label: "Planı hazırla", variant: "default" });
    expect(button.props).not.toHaveProperty("fallback");
    const context: JobRunContext = button.props.context;
    expect(context.seed.scope).toBe(MOCK_WORKSPACE_ID);
    expect(context.spend?.caps.apifyMonthlyCapUsd).toBeTypeOf("number");
    expect(context.spend?.month.committedUsd).toBeTypeOf("number");
  });

  it("müşteri görünümünde düğme çizilmez: yedek çizilir", async () => {
    mode(false);
    expect(await JobAction({ request: { kind: "plan" }, fallback: FALLBACK })).toBe(FALLBACK);
  });

  it("ortam uygun değilse düğme çizilmez: yedek, yedek yoksa hiçbir şey", async () => {
    availability.current = { available: false, reason: "worker_missing" };
    expect(await JobAction({ request: { kind: "routine", dryRun: true }, fallback: FALLBACK })).toBe(FALLBACK);
    expect(await JobAction({ request: { kind: "routine", dryRun: true } })).toBeNull();
  });
});
