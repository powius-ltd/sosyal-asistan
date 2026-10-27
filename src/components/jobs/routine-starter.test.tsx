// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestJobAction: vi.fn(), requestRoutineForAllAction: vi.fn(), cancelJobAction: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/actions/jobs", () => ({
  requestJobAction: mocks.requestJobAction,
  requestRoutineForAllAction: mocks.requestRoutineForAllAction,
  cancelJobAction: mocks.cancelJobAction,
}));

import { contextOf, RUNNING_JOB } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { JobsStartPanel } from "@/components/jobs/jobs-start-panel";
import { RoutineStarter } from "@/components/jobs/routine-starter";

const AMOUNT = "En çok harcanacak tutar (USD)";
const COLLECT = "Yeni veri de topla (para harcar)";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ workerNeeded: false }) });
  mocks.requestJobAction.mockResolvedValue({ ok: true, jobId: "job_routine" });
  vi.stubGlobal("fetch", mocks.fetch);
  jobStatusStore.reset();
});

afterEach(() => {
  jobStatusStore.reset();
  vi.unstubAllGlobals();
});

describe("RoutineStarter: haftalık tur", () => {
  it("'Önce bak' $0 ön bakış işini, 'Başlat' onaysız turu açar (toplama işaretli değilken para harcamaz)", async () => {
    const user = userEvent.setup();
    render(<RoutineStarter context={contextOf()} workspaceCount={1} />);
    expect(screen.queryByLabelText(AMOUNT)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Önce bak" }));
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "routine", dryRun: true });
    jobStatusStore.reset();
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "routine" });
  });

  it("'yeni veri de topla' işaretlenince tutar alanı açılır, düğme 'Onayla ve başlat' olur; ön değer son tahminden önerilir", async () => {
    const user = userEvent.setup();
    render(<RoutineStarter context={contextOf()} workspaceCount={1} collectEstimateUsd={0.11} />);
    await user.click(screen.getByRole("checkbox", { name: COLLECT }));
    expect(screen.getByLabelText(AMOUNT)).toHaveValue("0,15");
    expect(screen.getByText("$1,20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Onayla ve başlat" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "routine", approval: { basis: "one_time", maxUsd: 0.15 } });
  });

  it.each([
    ["boş", ""],
    ["0", "0"],
    ["sınır üstü", "3"],
  ])("toplama işaretliyken %s tutarla tur GÖNDERİLMEZ", async (_name, value) => {
    const user = userEvent.setup();
    render(<RoutineStarter context={contextOf()} workspaceCount={2} />);
    await user.click(screen.getByRole("checkbox", { name: COLLECT }));
    const input = screen.getByLabelText(AMOUNT);
    expect(input).toHaveValue("");
    if (value !== "") await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Onayla ve başlat" }));
    await user.click(screen.getByRole("button", { name: "Tüm hesaplar için onayla ve başlat" }));
    expect(mocks.requestJobAction).not.toHaveBeenCalled();
    expect(mocks.requestRoutineForAllAction).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("harcama kapalıysa (aylık sınır 0) ya da bilgi yoksa toplama seçilemez; tur yine onaysız başlatılabilir", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RoutineStarter context={contextOf({ apifyCapUsd: 0 })} workspaceCount={1} />);
    expect(screen.getByRole("checkbox", { name: COLLECT })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Yeni veri toplama şu an kapalı (aylık sınır 0).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Başlat" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "routine" });
    unmount();
    jobStatusStore.reset();
    render(<RoutineStarter context={contextOf({ spend: false })} workspaceCount={1} />);
    expect(screen.getByRole("checkbox", { name: COLLECT })).toHaveAttribute("aria-disabled", "true");
  });

  it("'Tüm hesaplar için başlat' yalnız birden çok hesap varken çizilir; sonucu düz dille yazar", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RoutineStarter context={contextOf()} workspaceCount={1} />);
    expect(screen.queryByRole("button", { name: "Tüm hesaplar için başlat" })).not.toBeInTheDocument();
    unmount();
    jobStatusStore.reset();
    mocks.requestRoutineForAllAction.mockResolvedValueOnce({ ok: true, requested: 2, skipped: 1, failed: 0, jobId: "job_all" });
    render(<RoutineStarter context={contextOf()} workspaceCount={3} />);
    await user.click(screen.getByRole("button", { name: "Tüm hesaplar için başlat" }));
    expect(mocks.requestRoutineForAllAction).toHaveBeenCalledExactlyOnceWith({});
    expect(await screen.findByText("2 hesapta haftalık tur sıraya yazıldı. 1 hesapta zaten sırada ya da çalışan bir iş vardı.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.fetch.mock.calls[0][0]).toBe("/api/isler?id=job_all");
  });

  it("'Tüm hesaplar' KISMİ başarı: açılan, atlanan ve açılamayan sayılar + neden uyarı olarak yazılır ('Olmadı' denmez)", async () => {
    const user = userEvent.setup();
    mocks.requestRoutineForAllAction.mockResolvedValueOnce({ ok: true, requested: 2, skipped: 1, failed: 1, failureReason: "Hesap bulunamadı. Sayfayı yenileyip tekrar dene." });
    render(<RoutineStarter context={contextOf()} workspaceCount={4} />);
    await user.click(screen.getByRole("button", { name: "Tüm hesaplar için başlat" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 hesapta haftalık tur sıraya yazıldı. 1 hesapta zaten sırada ya da çalışan bir iş vardı. 1 hesapta başlatılamadı: Hesap bulunamadı. Sayfayı yenileyip tekrar dene.");
    expect(alert).not.toHaveTextContent("Olmadı");
    expect(mocks.fetch, "geçerli hesapta iş açılmadı: izlenecek iş yok").not.toHaveBeenCalled();
  });

  it("'Tüm hesaplar' açılamazsa sebep yazılır", async () => {
    const user = userEvent.setup();
    mocks.requestRoutineForAllAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "İşler şu an başlatılamıyor." });
    render(<RoutineStarter context={contextOf()} workspaceCount={2} />);
    await user.click(screen.getByRole("button", { name: "Tüm hesaplar için başlat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Olmadı: İşler şu an başlatılamıyor.");
  });

  it("başka iş sürerken üç düğme de kapalıdır", () => {
    render(<RoutineStarter context={contextOf({ active: RUNNING_JOB })} workspaceCount={2} />);
    for (const name of ["Önce bak", "Başlat", "Tüm hesaplar için başlat"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });
});

describe("JobsStartPanel: tek tek işler", () => {
  it("altı iş düğmesi sözlükteki adlarıyla çizilir; hesap türü açı etiketlemesi uygulamıyorsa 'Açıları etiketle' yoktur", () => {
    const { unmount } = render(<JobsStartPanel context={contextOf()} workspaceCount={1} angleLabeling />);
    for (const name of ["Hesaba bak", "Videoları incele", "Açıları etiketle", "Planı hazırla", "Notları güncelle", "Sonuçları ölç"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    unmount();
    jobStatusStore.reset();
    render(<JobsStartPanel context={contextOf()} workspaceCount={1} angleLabeling={false} />);
    expect(screen.queryByRole("button", { name: "Açıları etiketle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Videoları incele" })).toBeInTheDocument();
  });

  it("'Hesaba bak' seçilen video sayısını tahmin işine taşır", async () => {
    const user = userEvent.setup();
    render(<JobsStartPanel context={contextOf()} workspaceCount={1} angleLabeling />);
    await user.click(screen.getByRole("combobox", { name: "Hesap başına video" }));
    await user.click(await screen.findByRole("option", { name: "20 video" }));
    await user.click(screen.getByRole("button", { name: "Hesaba bak" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "collect", limit: 20, dryRun: true });
  });
});
