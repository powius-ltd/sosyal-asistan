// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: mocks.requestJobAction, cancelJobAction: mocks.cancelJobAction }));

import { ACTION_UNREACHABLE_MESSAGE } from "@/components/common/call-action";
import { JOB_BLOCKED_NOTE } from "@/components/jobs/job-button-frame";
import { contextOf, ESTIMATE_JOB, QUEUED_JOB, RUNNING_JOB, STALE_JOB, viewOf } from "@/components/jobs/job-fixtures";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { RunJobButton } from "@/components/jobs/run-job-button";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";

const PLAN_RUNNING: PanelJob = { ...QUEUED_JOB, id: "job_plan", status: "running", steps: [{ id: "plan", status: "running" }], currentStep: "plan", heartbeatAt: "2026-10-05T11:59:55.000Z", startedAt: "2026-10-05T11:59:00.000Z" };
const PLAN_DONE: PanelJob = { ...PLAN_RUNNING, status: "succeeded", steps: [{ id: "plan", status: "ok" }], finishedAt: "2026-10-05T12:03:00.000Z" };

function respond(...bodies: JobsStatusResponse[]) {
  for (const body of bodies) mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
}
const opened = (jobId: string) => ({ ok: true as const, jobId });
const operatorView = (job: PanelJob) => viewOf(job, { operator: true });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ workerNeeded: false }) });
  mocks.cancelJobAction.mockResolvedValue({ ok: true, jobId: "job_estimate", status: "cancelled" });
  vi.stubGlobal("fetch", mocks.fetch);
  jobStatusStore.reset();
});

afterEach(() => {
  jobStatusStore.reset();
  vi.unstubAllGlobals();
});

describe("RunJobButton: para harcamayan iş", () => {
  it("basınca işi sıraya yazar; beklerken düğme kapalıdır ve düz dille ne yapıldığı yazılır; bitince sonuç yazılır, düğme açılır", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce(opened(PLAN_RUNNING.id));
    respond({ active: operatorView(PLAN_RUNNING), job: operatorView(PLAN_RUNNING), workerNeeded: false });
    render(<RunJobButton request={{ kind: "plan" }} context={contextOf()} />);
    const button = screen.getByRole("button", { name: "Planı hazırla" });
    await user.click(button);

    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "plan" });
    expect(await screen.findByText("Şimdi yaptığım: planını hazırlıyorum")).toBeInTheDocument();
    expect(mocks.fetch.mock.calls[0][0]).toBe(`/api/isler?id=${PLAN_RUNNING.id}`);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    respond({ job: operatorView(PLAN_DONE), workerNeeded: false });
    act(() => jobStatusStore.refresh());
    expect(await screen.findByText("İş bitti.")).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("varsayılan metin sözlükten gelir; önizlemede 'Önce bak' ve istek dryRun taşır", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_x"));
    render(<RunJobButton request={{ kind: "routine", dryRun: true }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Önce bak" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "routine", dryRun: true });
  });

  it("iş açılamazsa sebep yazılır ve 'Tekrar dene' aynı isteği yeniden gönderir", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce({ ok: false, code: "already_exists", message: "Bu çalışma alanında zaten süren bir iş var." });
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_y"));
    render(<RunJobButton request={{ kind: "briefing" }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Notları güncelle" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Olmadı: Bu çalışma alanında zaten süren bir iş var.");
    await user.click(within(alert).getByRole("button", { name: "Tekrar dene" }));
    expect(mocks.requestJobAction).toHaveBeenCalledTimes(2);
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "briefing" });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("sunucuya ulaşılamazsa (action fırlatırsa) Türkçe hata gösterilir", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockRejectedValueOnce(new Error("ağ yok"));
    render(<RunJobButton request={{ kind: "analyze" }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Videoları incele" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("İş başlatılamadı");
    expect(screen.getByRole("alert")).not.toHaveTextContent(ACTION_UNREACHABLE_MESSAGE);
  });

  it("açılan işin durumu okunamazsa düğme beklemede kalmaz", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_gorunmez"));
    render(<RunJobButton request={{ kind: "label" }} context={contextOf()} />);
    const button = screen.getByRole("button", { name: "Açıları etiketle" });
    await user.click(button);
    expect(await screen.findByText("İşi sıraya yazdım.")).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it("çalışma alanında başka iş sürerken kapalıdır ve nedenini söyler; yanıt vermeyen iş engel değildir", () => {
    const { unmount } = render(<RunJobButton request={{ kind: "plan" }} context={contextOf({ active: RUNNING_JOB })} />);
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toBeDisabled();
    expect(screen.getByText(JOB_BLOCKED_NOTE)).toBeInTheDocument();
    unmount();
    jobStatusStore.reset();
    render(<RunJobButton request={{ kind: "plan" }} context={contextOf({ active: STALE_JOB })} />);
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toBeEnabled();
  });
});

describe("RunJobButton: para harcayan iş (onay penceresi)", () => {
  /** Düğmeye basar; $0 tahmin işi biter ve onay formu görünür. */
  async function openApproval(options: { kind?: "collect" | "measure"; estimate?: PanelJob; context?: ReturnType<typeof contextOf> } = {}) {
    const user = userEvent.setup();
    const kind = options.kind ?? "collect";
    const estimate = options.estimate ?? { ...ESTIMATE_JOB, kind };
    mocks.requestJobAction.mockResolvedValueOnce(opened(estimate.id));
    respond({ job: operatorView(estimate), workerNeeded: false });
    render(<RunJobButton request={{ kind }} context={options.context ?? contextOf()} />);
    await user.click(screen.getByRole("button", { name: kind === "collect" ? "Hesaba bak" : "Sonuçları ölç" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Tahmini tutar");
    return { user, dialog: within(dialog) };
  }

  it("basınca gerçek iş BAŞLAMAZ: önce $0 tahmin işi açılır; tahmin, bu ay harcanan / sınır ve önerilen tutar gösterilir", async () => {
    const { dialog } = await openApproval();
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "collect", dryRun: true });
    expect(dialog.getByText("$0,13")).toBeInTheDocument();
    expect(dialog.getByText("İzlenen rakipler: içerik (4 × 10)")).toBeInTheDocument();
    expect(dialog.getByText("$1,20")).toBeInTheDocument();
    expect(dialog.getByText("$10,00")).toBeInTheDocument();
    expect(dialog.getByLabelText("En çok harcanacak tutar (USD)")).toHaveValue("0,15");
  });

  it("onay penceresi 'Tahmini kredi'yi de söyler (5 hesap × 8 = ≈ 40); bilgi amaçlıdır, onayı engellemez", async () => {
    const { dialog } = await openApproval();
    expect(dialog.getByText("Tahmini kredi")).toBeInTheDocument();
    expect(dialog.getByText("≈ 40 kredi")).toBeInTheDocument();
    expect(dialog.getByText(/Hesaba bakış · 5 hesap × 8/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Onayla ve başlat" })).toBeEnabled();
  });

  it("birim sayısı belli değilse kredi tahmini tire + sebep olur (0 yazılmaz)", async () => {
    const { dialog } = await openApproval({ estimate: { ...ESTIMATE_JOB, result: { exitCode: 0, estimate: { usd: 0.13, lines: [] } } } });
    expect(dialog.getByText("Kaç hesap ve video işleneceği henüz belli değil.")).toBeInTheDocument();
    expect(dialog.queryByText(/≈ 0 kredi/)).not.toBeInTheDocument();
  });

  it.each([
    ["boş", ""],
    ["0", "0"],
    ["sınır üstü", "2,01"],
    ["sayı değil", "çok"],
  ])("%s tutar GÖNDERİLMEZ ve nedeni yazılır", async (_name, value) => {
    const { user, dialog } = await openApproval();
    const input = dialog.getByLabelText("En çok harcanacak tutar (USD)");
    await user.clear(input);
    if (value !== "") await user.type(input, value);
    await user.click(dialog.getByRole("button", { name: "Onayla ve başlat" }));
    expect(mocks.requestJobAction).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(dialog.getByText(/Tutar/, { selector: "p.text-destructive" })).toBeInTheDocument();
  });

  it("geçerli tutarla 'Onayla ve başlat' gerçek işi onay kaydıyla açar ve pencere kapanır", async () => {
    const { user, dialog } = await openApproval();
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_real"));
    await user.click(dialog.getByRole("button", { name: "Onayla ve başlat" }));
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "collect", approval: { basis: "one_time", maxUsd: 0.15 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("gerçek iş açılamazsa pencere açık kalır ve sebep yazılır", async () => {
    const { user, dialog } = await openApproval();
    mocks.requestJobAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "İşler şu an başlatılamıyor." });
    await user.click(dialog.getByRole("button", { name: "Onayla ve başlat" }));
    expect(await dialog.findByText("İşler şu an başlatılamıyor.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("tahminin altındaki tutar uyarı verir ama gönderilebilir", async () => {
    const { user, dialog } = await openApproval();
    const input = dialog.getByLabelText("En çok harcanacak tutar (USD)");
    await user.clear(input);
    await user.type(input, "0,05");
    expect(dialog.getByText("Bu tutar tahminin altında: iş başlamadan durur.")).toBeInTheDocument();
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_real"));
    await user.click(dialog.getByRole("button", { name: "Onayla ve başlat" }));
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "collect", approval: { basis: "one_time", maxUsd: 0.05 } });
  });

  it("tahmin tek seferde onaylanabilecek en yüksek tutarı aşıyorsa onay kapalıdır (Enter da göndermez)", async () => {
    const { user, dialog } = await openApproval({ estimate: { ...ESTIMATE_JOB, result: { exitCode: 0, estimate: { usd: 2.4, lines: [] } } } });
    expect(dialog.getByLabelText("En çok harcanacak tutar (USD)")).toHaveValue("");
    expect(dialog.getByRole("button", { name: "Onayla ve başlat" })).toBeDisabled();
    expect(dialog.getByText(/en yüksek tutarı/)).toBeInTheDocument();
    await user.type(dialog.getByLabelText("En çok harcanacak tutar (USD)"), "1");
    await user.keyboard("{Enter}");
    expect(mocks.requestJobAction).toHaveBeenCalledTimes(1);
  });

  it("fiyat okunamadıysa tahmin tire + sebep olur (0 yazılmaz) ve ön değer önerilmez", async () => {
    const { dialog } = await openApproval({ estimate: { ...ESTIMATE_JOB, result: { exitCode: 0, estimate: { lines: [] } } } });
    expect(dialog.getByText("Fiyat okunamadı.")).toBeInTheDocument();
    expect(dialog.queryByText("$0,00")).not.toBeInTheDocument();
    expect(dialog.getByLabelText("En çok harcanacak tutar (USD)")).toHaveValue("");
  });

  it("ölçüm: aylık ölçüm sınırı onaylıysa tek onay önerilir; ayrı tutar da seçilebilir", async () => {
    const { user, dialog } = await openApproval({ kind: "measure", context: contextOf({ measureCapUsd: 0.5 }) });
    expect(dialog.getByRole("radio", { name: "Onaylı aylık ölçüm sınırının içinde ($0,50)" })).toBeChecked();
    expect(dialog.queryByLabelText("En çok harcanacak tutar (USD)")).not.toBeInTheDocument();
    await user.click(dialog.getByRole("radio", { name: "Bu iş için ayrı tutar" }));
    expect(dialog.getByLabelText("En çok harcanacak tutar (USD)")).toHaveValue("0,15");
    await user.click(dialog.getByRole("radio", { name: /Onaylı aylık ölçüm sınırının içinde/ }));
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_measure"));
    await user.click(dialog.getByRole("button", { name: "Onayla ve başlat" }));
    expect(mocks.requestJobAction).toHaveBeenLastCalledWith({ kind: "measure", approval: { basis: "monthly_cap" } });
  });

  it("ölçüm sınırı onaysızsa seçim yoktur: tutar girilir", async () => {
    const { dialog } = await openApproval({ kind: "measure" });
    expect(dialog.queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog.getByLabelText("En çok harcanacak tutar (USD)")).toBeInTheDocument();
  });

  it("tahmin işi açılamazsa form çizilmez; sebep + 'Tekrar dene'", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce({ ok: false, code: "already_exists", message: "Zaten süren bir iş var." });
    render(<RunJobButton request={{ kind: "collect" }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Hesaba bak" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("Zaten süren bir iş var.")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Onayla ve başlat" })).not.toBeInTheDocument();
    mocks.requestJobAction.mockResolvedValueOnce(opened(ESTIMATE_JOB.id));
    respond({ job: operatorView(ESTIMATE_JOB), workerNeeded: false });
    await user.click(dialog.getByRole("button", { name: "Tekrar dene" }));
    expect(await dialog.findByText("Tahmini tutar")).toBeInTheDocument();
  });

  it("tahmin işi sorunla biterse sonucu düz dille yazılır, onay verilemez", async () => {
    const user = userEvent.setup();
    const failed: PanelJob = { ...ESTIMATE_JOB, status: "blocked", result: { outcome: "no_targets" } };
    mocks.requestJobAction.mockResolvedValueOnce(opened(failed.id));
    respond({ job: operatorView(failed), workerNeeded: false });
    render(<RunJobButton request={{ kind: "collect" }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Hesaba bak" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("Bakılacak hesap bulunamadı.")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Onayla ve başlat" })).not.toBeInTheDocument();
  });

  it("tahmin sürerken 'Vazgeç' pencereyi kapatır ve tahmin işini durdurur", async () => {
    const user = userEvent.setup();
    const running: PanelJob = { ...ESTIMATE_JOB, status: "running", heartbeatAt: "2026-10-05T11:59:58.000Z" };
    mocks.requestJobAction.mockResolvedValueOnce(opened(running.id));
    respond({ active: operatorView(running), job: operatorView(running), workerNeeded: false });
    render(<RunJobButton request={{ kind: "collect" }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Hesaba bak" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByText("Ne kadar tutacağına bakıyorum…")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Vazgeç" }));
    expect(mocks.cancelJobAction).toHaveBeenCalledExactlyOnceWith({ jobId: running.id });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.requestJobAction).toHaveBeenCalledTimes(1);
  });

  it("harcama kapalıysa (aylık sınır 0) ya da harcama bilgisi yoksa düğme kapalıdır; pencere açılmaz", () => {
    const { unmount } = render(<RunJobButton request={{ kind: "collect" }} context={contextOf({ apifyCapUsd: 0 })} />);
    expect(screen.getByRole("button", { name: "Hesaba bak" })).toBeDisabled();
    expect(screen.getByText(/harcama şu an kapalı/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ayarlar'dan aç" })).toHaveAttribute("href", "/ayarlar");
    unmount();
    jobStatusStore.reset();
    render(<RunJobButton request={{ kind: "measure" }} context={contextOf({ spend: false })} />);
    expect(screen.getByRole("button", { name: "Sonuçları ölç" })).toBeDisabled();
    expect(screen.getByText(/Harcama bilgisini okuyamadım/)).toBeInTheDocument();
  });

  it("ölçüm kapalıysa (ölçüm sınırı 0) 'Sonuçları ölç' kapalıdır", () => {
    render(<RunJobButton request={{ kind: "measure" }} context={contextOf({ measureCapUsd: 0 })} />);
    expect(screen.getByRole("button", { name: "Sonuçları ölç" })).toBeDisabled();
  });

  it("toplama önizlemesi ($0) onay penceresi açmaz: doğrudan sıraya yazılır", async () => {
    const user = userEvent.setup();
    mocks.requestJobAction.mockResolvedValueOnce(opened("job_preview"));
    render(<RunJobButton request={{ kind: "collect", dryRun: true, limit: 10 }} context={contextOf()} />);
    await user.click(screen.getByRole("button", { name: "Önce bak" }));
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "collect", dryRun: true, limit: 10 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
