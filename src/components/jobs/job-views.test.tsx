// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: mocks.requestJobAction, cancelJobAction: mocks.cancelJobAction }));

import {
  BLOCKED_JOB,
  CANCELLED_JOB,
  contextOf,
  ESTIMATE_JOB,
  FAILED_JOB,
  FIXTURE_TZ,
  PARTIAL_JOB,
  QUEUED_JOB,
  RUNNING_JOB,
  seedOf,
  STALE_JOB,
  SUCCEEDED_JOB,
  viewOf,
} from "@/components/jobs/job-fixtures";
import { JobHistory, restartRequest } from "@/components/jobs/job-history";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { LiveJobPanel } from "@/components/jobs/live-job-panel";
import type { PanelJob } from "@/lib/domain/panel-job";
import { PANEL_JARGON } from "@/lib/plain-language";

/** Yalnız yöneticinin görebileceği izler: tutar, sağlayıcı adı, ham not, günlük, teknik hata. */
const OPERATOR_ONLY = /\$|USD|Apify|agy|Günlük|worker_lost|kota doldu|Onay|Tahmin|kredi|docs\/rutin/;

const FINISHED: PanelJob[] = [SUCCEEDED_JOB, PARTIAL_JOB, BLOCKED_JOB, FAILED_JOB, CANCELLED_JOB, ESTIMATE_JOB];
const panel = () => document.querySelector("[data-slot=live-job]");
const row = (job: PanelJob) => within(document.querySelector(`[data-job=${job.id}]`) as HTMLElement);

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ workerNeeded: false }) });
  vi.stubGlobal("fetch", mocks.fetch);
  jobStatusStore.reset();
});

afterEach(() => {
  jobStatusStore.reset();
  vi.unstubAllGlobals();
});

describe("LiveJobPanel: çalışan / sıradaki iş", () => {
  it("boş: etkin iş yokken bunu söyler; düğme yok", () => {
    render(<LiveJobPanel seed={seedOf()} canRun timeZone={FIXTURE_TZ} />);
    expect(panel()).toHaveAttribute("data-state", "idle");
    expect(screen.getByText("Çalışan ya da sırada bekleyen bir iş yok.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("sırada: rozet + cümle; adımlar 'sırada' olarak listelenir; 'Durdur' var", () => {
    render(<LiveJobPanel seed={seedOf({ ...QUEUED_JOB, kind: "routine" }, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    expect(panel()).toHaveAttribute("data-state", "queued");
    expect(screen.getByText("Sıradaki iş: Haftalık tur")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-step-status=pending]")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled();
  });

  it("çalışıyor: adımlar GERÇEK durumlarıyla (tamam / onay bekliyor / sürüyor + sayaç / gerek yoktu / sırada)", () => {
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    expect(panel()).toHaveAttribute("data-state", "running");
    expect(screen.getByText("Şimdi yaptığım: videolarını inceliyorum (7/19)")).toBeInTheDocument();
    const step = (id: string) => document.querySelector(`[data-step=${id}]`) as HTMLElement;
    expect(step("precheck")).toHaveTextContent("Hazırlık · tamam");
    expect(step("collect")).toHaveTextContent("Hesaba bakış · onay bekliyor");
    expect(step("analyze")).toHaveTextContent("Video inceleme · sürüyor (7/19)");
    expect(step("cluster")).toHaveTextContent("Konu gruplama · gerek yoktu");
    expect(step("cluster")).toHaveTextContent("Bu hesap türünde bu adıma gerek yok.");
    expect(step("plan")).toHaveTextContent("Plan · sırada");
  });

  it("yanıt vermiyor: rozet ve uyarı; 'Durdur' açık kalır", () => {
    render(<LiveJobPanel seed={seedOf(STALE_JOB, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    expect(panel()).toHaveAttribute("data-state", "stale");
    expect(within(panel() as HTMLElement).getByText("yanıt vermiyor", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(screen.getByText("Bir süredir yanıt gelmiyor. Durdurup yeniden başlatabilirsin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled();
  });

  it("yönetici: ham not, tutar ve günlük görünür", () => {
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    expect(screen.getByText("agy ile video analizi sürüyor.")).toBeInTheDocument();
    expect(screen.getByText(/Bu iş için en çok \$0,15/)).toBeInTheDocument();
    expect(screen.getByText("Günlük (son satırlar)")).toBeInTheDocument();
  });

  it("müşteri görünümü: tutar, sağlayıcı, ham not, günlük ve 'Durdur' YOK; cümle ve adımlar düz dildedir", () => {
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB)} canRun={false} timeZone={FIXTURE_TZ} />);
    const text = panel()?.textContent ?? "";
    expect(text).toContain("Şimdi yaptığım: videolarını inceliyorum (7/19)");
    expect(text).not.toMatch(OPERATOR_ONLY);
    expect(text).not.toMatch(PANEL_JARGON);
    expect(screen.queryByRole("button", { name: "Durdur" })).not.toBeInTheDocument();
  });

  it("'Durdur' işi durdurur ve durumu hemen yeniden okur; durdurma istenmişse düğme kapanır", async () => {
    const user = userEvent.setup();
    mocks.cancelJobAction.mockResolvedValueOnce({ ok: true, jobId: RUNNING_JOB.id, status: "running" });
    const stopping = viewOf({ ...RUNNING_JOB, cancelRequestedAt: "2026-10-05T12:00:00.000Z" }, { operator: true });
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ active: stopping, job: stopping, workerNeeded: false }) });
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    await user.click(screen.getByRole("button", { name: "Durdur" }));
    expect(mocks.cancelJobAction).toHaveBeenCalledExactlyOnceWith({ jobId: RUNNING_JOB.id });
    expect(await screen.findByText(/bu adım bitince duracağım/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Durdur" })).toBeDisabled();
  });

  it("durdurulamazsa sebep yazılır, iş görünmeye devam eder", async () => {
    const user = userEvent.setup();
    mocks.cancelJobAction.mockResolvedValueOnce({ ok: false, code: "invalid_state", message: "Bitmiş iş durdurulamaz." });
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB, { operator: true })} canRun timeZone={FIXTURE_TZ} />);
    await user.click(screen.getByRole("button", { name: "Durdur" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Olmadı: Bitmiş iş durdurulamaz.");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("iş bitince panel boş duruma döner", async () => {
    render(<LiveJobPanel seed={seedOf(RUNNING_JOB)} canRun={false} timeZone={FIXTURE_TZ} />);
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job: viewOf({ ...RUNNING_JOB, status: "succeeded" }), workerNeeded: false }) });
    act(() => jobStatusStore.refresh());
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "idle"));
  });
});

describe("JobHistory: biten işler", () => {
  it("boş: henüz iş yok", () => {
    render(<JobHistory jobs={[]} timeZone={FIXTURE_TZ} />);
    expect(screen.getByText("Henüz iş yok")).toBeInTheDocument();
  });

  it("her bitiş durumu rozetle ve sözlükteki sonuç cümlesiyle yazılır; süre işin kendi anlarından", () => {
    render(<JobHistory jobs={FINISHED.map((job) => viewOf(job))} timeZone={FIXTURE_TZ} />);
    expect(row(SUCCEEDED_JOB).getByText("bitti")).toBeInTheDocument();
    expect(row(SUCCEEDED_JOB).getByText("İş bitti.")).toBeInTheDocument();
    expect(row(SUCCEEDED_JOB).getByText(/42 sn sürdü/)).toBeInTheDocument();
    expect(row(PARTIAL_JOB).getByText("kısmen bitti")).toBeInTheDocument();
    expect(row(PARTIAL_JOB).getByText("Bazı adımlar tamamlanamadı.")).toBeInTheDocument();
    expect(row(PARTIAL_JOB).getByText("Video inceleme aracına şu an ulaşamıyorum.")).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText("durdu")).toBeInTheDocument();
    // Tek adımlı işte adımın cümlesi işin sonuç cümlesiyle aynıdır: bir kez yazılır.
    expect(row(BLOCKED_JOB).getAllByText("Bu iş onaylanan sınırı aşacaktı; başlamadım.")).toHaveLength(1);
    expect(row(FAILED_JOB).getByText("tamamlanamadı")).toBeInTheDocument();
    expect(row(FAILED_JOB).getByText("İş yarıda kaldı.")).toBeInTheDocument();
    expect(row(CANCELLED_JOB).getByText("durduruldu")).toBeInTheDocument();
    expect(row(CANCELLED_JOB).getByText("İş durduruldu.")).toBeInTheDocument();
    expect(row(CANCELLED_JOB).getByText("Bu iş başlamadan bitti; gösterilecek adım yok.")).toBeInTheDocument();
    expect(row(ESTIMATE_JOB).getByText("Hesaba bak · ön bakış")).toBeInTheDocument();
  });

  it("müşteri görünümü: tutar, sağlayıcı, ham not, teknik hata, günlük, rapor yolu ve düğme YOK; jargon yok", () => {
    const { container } = render(<JobHistory jobs={FINISHED.map((job) => viewOf(job))} timeZone={FIXTURE_TZ} />);
    expect(container.textContent).not.toMatch(OPERATOR_ONLY);
    expect(container.textContent).not.toMatch(PANEL_JARGON);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-operator]")).toBeNull();
  });

  it("yönetici: ham adım notu, süre, onay / tahmin tutarı, teknik hata, günlük ve rapor yolu açılır", () => {
    render(<JobHistory jobs={FINISHED.map((job) => viewOf(job, { operator: true }))} timeZone={FIXTURE_TZ} />);
    expect(row(PARTIAL_JOB).getByText("Video analizi arka ucu (agy) kullanılamıyor: kota doldu.")).toBeInTheDocument();
    expect(row(PARTIAL_JOB).getByText("docs/rutin/ornek/2026-10-01.md")).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText(/Bu iş için en çok \$0,10/)).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText("$0,13")).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText(/5 sn · tahmin \$0,13/)).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText("Hesap başına 10 video")).toBeInTheDocument();
    expect(row(FAILED_JOB).getByText("worker_lost: işçi yanıt vermedi")).toBeInTheDocument();
    expect(row(FAILED_JOB).getByText("Günlük (son satırlar)")).toBeInTheDocument();
  });

  it("yönetici: kuru koşu tahmininde 'bu iş ≈ X kredi' (hesap × 8) ve dökümü; birim sayısı olmayan tahminde tire + sebep", () => {
    render(<JobHistory jobs={[ESTIMATE_JOB, BLOCKED_JOB].map((job) => viewOf(job, { operator: true }))} timeZone={FIXTURE_TZ} />);
    expect(row(ESTIMATE_JOB).getByText("≈ 40 kredi")).toBeInTheDocument();
    expect(row(ESTIMATE_JOB).getByText(/Hesaba bakış · 5 hesap × 8/)).toBeInTheDocument();
    expect(row(BLOCKED_JOB).getByText("Kaç hesap ve video işleneceği henüz belli değil.")).toBeInTheDocument();
    expect(row(BLOCKED_JOB).queryByText(/≈ 0 kredi/)).not.toBeInTheDocument();
  });

  it("yönetici: yalnız birim sayısı taşıyan tahmin (tur ön bakışı, referans tutar yok) boş 'Tahmin' satırı çizmez; kredi satırı kalır", () => {
    const unitsOnly: PanelJob = { ...ESTIMATE_JOB, kind: "routine", result: { exitCode: 0, estimate: { lines: [], units: { accounts: 0, videos: 3, measureRuns: 0 } } } };
    render(<JobHistory jobs={[viewOf(unitsOnly, { operator: true })]} timeZone={FIXTURE_TZ} />);
    expect(row(unitsOnly).queryByText("Tahmin")).not.toBeInTheDocument();
    expect(row(unitsOnly).queryByText("Fiyat okunamadı.")).not.toBeInTheDocument();
    expect(row(unitsOnly).getByText("≈ 94 kredi")).toBeInTheDocument();
  });

  it("yönetici: krediye bağlı işte kredi tavanı onay satırında, düşülen kredi kendi satırında; müşteri görünümünde ikisi de yok", () => {
    const credited: PanelJob = {
      ...SUCCEEDED_JOB,
      kind: "analyze",
      approval: { basis: "credits", maxCredits: 50, approvedBy: "kullanıcı", approvedAt: "2026-10-05T09:00:00.000Z" },
      result: { exitCode: 0, credits: { reserved: 50, due: 30, charged: 30, units: { video_review: 3 }, priceVersion: "2026-10-12" } },
    };
    const pending: PanelJob = { ...credited, id: "job_kredi_bekleyen", result: { exitCode: 0, credits: { reserved: 50, due: 30 } } };
    const { unmount } = render(<JobHistory jobs={[credited, pending].map((job) => viewOf(job, { operator: true }))} timeZone={FIXTURE_TZ} />);
    expect(row(credited).getByText(/^en çok 50 kredi/)).toBeInTheDocument();
    expect(row(credited).getByText("30 kredi düşüldü · ayrılan 50")).toBeInTheDocument();
    expect(row(pending).getByText("30 kredi düşülecek (henüz yazılmadı) · ayrılan 50")).toBeInTheDocument();
    expect(row(credited).queryByText(/\$/), "kredi onayı tutar göstermez").not.toBeInTheDocument();
    unmount();
    const { container } = render(<JobHistory jobs={[viewOf(credited)]} timeZone={FIXTURE_TZ} />);
    expect(container.textContent).not.toMatch(/kredi/);
  });

  it("en üstteki satır açık gelir; diğerleri kapalıdır (klavyeyle açılır)", () => {
    render(<JobHistory jobs={FINISHED.map((job) => viewOf(job))} timeZone={FIXTURE_TZ} />);
    const details = [...document.querySelectorAll("[data-slot=job-history] > li > details")] as HTMLDetailsElement[];
    expect(details.map((item) => item.open)).toEqual([true, false, false, false, false, false]);
  });

  it("'Yeniden başlat' yalnız işler açıkken ve yalnız en üstteki tamamlanmamış işte; onay taşınmaz", async () => {
    const user = userEvent.setup();
    const jobs = [BLOCKED_JOB, FAILED_JOB].map((job) => viewOf(job, { operator: true }));
    const { unmount } = render(<JobHistory jobs={jobs} timeZone={FIXTURE_TZ} />);
    expect(screen.queryByRole("button", { name: "Yeniden başlat" })).not.toBeInTheDocument();
    unmount();

    mocks.requestJobAction.mockResolvedValueOnce({ ok: true, jobId: "job_estimate" });
    render(<JobHistory jobs={jobs} timeZone={FIXTURE_TZ} context={contextOf()} />);
    expect(screen.getAllByRole("button", { name: "Yeniden başlat" })).toHaveLength(1);
    await user.click(row(BLOCKED_JOB).getByRole("button", { name: "Yeniden başlat" }));
    // Para harcayan iş: önce $0 tahmin; eski onay tutarı yeniden kullanılmaz.
    expect(mocks.requestJobAction).toHaveBeenCalledExactlyOnceWith({ kind: "collect", limit: 10, dryRun: true });
  });

  it("biten iş, önizleme ve plan haftası yeniden başlatma isteğine taşınmaz", () => {
    expect(restartRequest(viewOf(SUCCEEDED_JOB, { operator: true }))).toBeUndefined();
    expect(restartRequest(viewOf({ ...ESTIMATE_JOB, status: "failed" }, { operator: true }))).toBeUndefined();
    expect(restartRequest(viewOf({ ...CANCELLED_JOB, params: { week: "2026-09-28" } }, { operator: true }))).toEqual({ kind: "plan" });
    expect(restartRequest(viewOf(PARTIAL_JOB, { operator: true }))).toEqual({ kind: "routine" });
  });
});
