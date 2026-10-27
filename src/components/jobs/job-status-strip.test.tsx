// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), kickWorkerAction: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/jobs", () => ({ kickWorkerAction: mocks.kickWorkerAction }));

import { QUEUED_JOB, RUNNING_JOB, seedOf, STALE_JOB, viewOf } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { JOB_FINISHED_NOTICE_MS, JobStatusStrip } from "@/components/jobs/job-status-strip";
import { JOB_KINDS, JOB_OUTCOME_CODES, JOB_POLL_INTERVAL_MS, JOB_STATUSES, JOB_STEPS_BY_KIND, type PanelJob } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";
import { PANEL_JARGON } from "@/lib/plain-language";

const IDLE: JobsStatusResponse = { workerNeeded: false };

function respond(...bodies: JobsStatusResponse[]) {
  for (const body of bodies) mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const tick = (ms: number = JOB_POLL_INTERVAL_MS) => act(() => vi.advanceTimersByTimeAsync(ms));
const strip = () => document.querySelector("[data-slot=job-strip]");

function renderStrip(active?: PanelJob, options: { operator?: boolean; canKick?: boolean; workerNeeded?: boolean } = {}) {
  const seed = seedOf(active, { operator: options.operator });
  if (options.workerNeeded) seed.status.workerNeeded = true;
  return render(<JobStatusStrip seed={seed} operator={options.operator ?? false} canKick={options.canKick ?? false} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => IDLE });
  mocks.kickWorkerAction.mockResolvedValue({ ok: true, started: true });
  vi.stubGlobal("fetch", mocks.fetch);
  jobStatusStore.reset();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("JobStatusStrip: durumlar", () => {
  it("etkin iş yokken hiçbir şey çizmez ve HİÇ yoklamaz", async () => {
    renderStrip();
    await tick(60_000);
    expect(strip()).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sıradaki iş: 'Sıradaki iş: …'", () => {
    renderStrip(QUEUED_JOB);
    expect(strip()).toHaveAttribute("data-state", "queued");
    expect(strip()).toHaveTextContent("Sıradaki iş: Planı hazırla");
  });

  it("çalışan iş: düz dil cümlesi + sayaç; ekran okuyucu satırında sayaç yok", () => {
    renderStrip(RUNNING_JOB);
    expect(strip()).toHaveAttribute("data-state", "running");
    expect(strip()).toHaveTextContent("Şimdi yaptığım: videolarını inceliyorum (7/19)");
    expect(screen.getByRole("status")).toHaveTextContent(/^Şimdi yaptığım: videolarını inceliyorum$/);
  });

  it("yanıt vermeyen iş: 'yanıt vermiyor'", () => {
    renderStrip(STALE_JOB);
    expect(strip()).toHaveAttribute("data-state", "stale");
    expect(strip()).toHaveTextContent("Haftalık tur: yanıt vermiyor");
  });

  it("durdurma istenen iş bunu söyler", () => {
    renderStrip({ ...RUNNING_JOB, cancelRequestedAt: "2026-10-05T11:59:00.000Z" });
    expect(strip()).toHaveTextContent("bu adım bitince duracağım");
  });
});

describe("JobStatusStrip: yoklama ve bitiş", () => {
  it("etkin iş varken 4 sn'de bir, işin kimliğiyle yoklar ve cümleyi günceller", async () => {
    respond({ active: { ...viewOf(RUNNING_JOB), progress: { done: 8, total: 19 } }, workerNeeded: false });
    renderStrip(RUNNING_JOB);
    await tick(JOB_POLL_INTERVAL_MS - 100);
    expect(mocks.fetch).not.toHaveBeenCalled();
    await tick(100);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/isler?id=${RUNNING_JOB.id}`);
    expect(strip()).toHaveTextContent("(8/19)");
  });

  it("sekme gizliyken yoklama durur; görününce hemen okur", async () => {
    renderStrip(RUNNING_JOB);
    setVisibility("hidden");
    await tick(60_000);
    expect(mocks.fetch).not.toHaveBeenCalled();
    respond({ active: viewOf(RUNNING_JOB), workerNeeded: false });
    setVisibility("visible");
    await tick(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("iş bitince sayfa verisi yenilenir, sonuç cümlesi yazılır ve yoklama durur; başarı satırı kendiliğinden kalkar", async () => {
    respond({ job: viewOf({ ...RUNNING_JOB, status: "succeeded", finishedAt: "2026-10-05T12:05:00.000Z" }), workerNeeded: false });
    renderStrip(RUNNING_JOB);
    await tick();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(strip()).toHaveAttribute("data-state", "succeeded");
    expect(strip()).toHaveTextContent("Haftalık tur: İş bitti.");
    await tick(JOB_FINISHED_NOTICE_MS);
    expect(strip()).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("sorunlu sonuç kapatılana kadar durur", async () => {
    respond({ job: viewOf({ ...RUNNING_JOB, status: "blocked", result: { outcome: "budget_refused" }, finishedAt: "2026-10-05T12:05:00.000Z" }), workerNeeded: false });
    renderStrip(RUNNING_JOB);
    await tick();
    await tick(JOB_FINISHED_NOTICE_MS * 2);
    expect(strip()).toHaveTextContent("Haftalık tur: Bu ayın sınırı buna izin vermiyor; başlamadım.");
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(strip()).toBeNull();
  });

  it("biten önizleme ($0 ön bakış) şeride sonuç satırı yazmaz ama sayfayı yeniler", async () => {
    const preview = { ...RUNNING_JOB, dryRun: true };
    respond({ job: viewOf({ ...preview, status: "succeeded", finishedAt: "2026-10-05T12:05:00.000Z" }), workerNeeded: false });
    renderStrip(preview);
    expect(strip()).toHaveTextContent("Şimdi yaptığım: yapılacaklara bakıyorum");
    await tick();
    expect(strip()).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("JobStatusStrip: yönetici / müşteri", () => {
  it("müşteri görünümü: 'Ayrıntı' bağlantısı yok, işçi dürtülmez", async () => {
    renderStrip(QUEUED_JOB, { workerNeeded: true });
    await tick(0);
    expect(screen.queryByRole("link", { name: "Ayrıntı" })).not.toBeInTheDocument();
    expect(mocks.kickWorkerAction).not.toHaveBeenCalled();
  });

  it("yönetici: 'Ayrıntı' İşler sayfasına gider; sırada iş var ama işçi yoksa işçi dürtülür", async () => {
    renderStrip(QUEUED_JOB, { operator: true, canKick: true, workerNeeded: true });
    await tick(0);
    expect(screen.getByRole("link", { name: "Ayrıntı" })).toHaveAttribute("href", "/isler");
    expect(mocks.kickWorkerAction).toHaveBeenCalledTimes(1);
  });

  it("'Ayrıntı' dar ekranda ≥ 48 px dokunma hedefi (D1-11): şerit uzamasın diye dolgusu negatif dış boşlukla geri alınır", async () => {
    renderStrip(RUNNING_JOB, { operator: true });
    await tick(0);
    expect(screen.getByRole("link", { name: "Ayrıntı" })).toHaveClass("min-h-tap", "-my-1.5", "md:my-0");
  });

  it("yönetici ama işler kapalıysa (ör. örnek veri) işçi dürtülmez", async () => {
    renderStrip(QUEUED_JOB, { operator: true, canKick: false, workerNeeded: true });
    await tick(0);
    expect(mocks.kickWorkerAction).not.toHaveBeenCalled();
  });
});

describe("JobStatusStrip: düz dil", () => {
  it("hiçbir tür / adım / durum / sonuç için şerit metninde panel jargonu, tutar ya da sağlayıcı adı yok", async () => {
    const texts: string[] = [];
    const collect = () => {
      texts.push(document.body.textContent ?? "");
    };
    for (const kind of JOB_KINDS) {
      for (const dryRun of [false, true]) {
        for (const currentStep of [undefined, ...JOB_STEPS_BY_KIND[kind]]) {
          jobStatusStore.reset();
          const job: PanelJob = { ...RUNNING_JOB, kind, dryRun, steps: [], currentStep, logTail: "Apify $0,13 hook lift", error: "agy kotası" };
          const { unmount } = renderStrip(job, { operator: false });
          collect();
          unmount();
        }
      }
      for (const status of JOB_STATUSES) {
        for (const outcome of [undefined, ...JOB_OUTCOME_CODES]) {
          jobStatusStore.reset();
          mocks.fetch.mockReset();
          respond({ job: viewOf({ ...RUNNING_JOB, kind, status, ...(outcome ? { result: { outcome } } : {}) }), workerNeeded: false });
          const { unmount } = renderStrip({ ...RUNNING_JOB, kind });
          await tick();
          collect();
          unmount();
        }
      }
    }
    expect(texts.length).toBeGreaterThan(500);
    // Boş metin sessizce geçmesin: çalışan iş cümleleri ve bitmiş iş sonuçları gerçekten çizildi.
    expect(texts.filter((text) => text.trim() !== "").length).toBeGreaterThan(600);
    for (const text of texts) {
      expect(text).not.toMatch(PANEL_JARGON);
      expect(text).not.toMatch(/Apify|agy|Claude|USD|\$|npm run/);
    }
  });
});
