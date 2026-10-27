// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ current: { available: true } as { available: true } | { available: false; reason: string } }));
vi.mock("@/lib/job-control/availability", () => ({ jobsAvailability: () => availability.current }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn(), cancelJobAction: vi.fn(), kickWorkerAction: vi.fn(), requestRoutineForAllAction: vi.fn() }));

import JobsPage from "@/app/(panel)/isler/page";
import { jobStatusStore } from "@/components/jobs/job-status-store";
import { getPanelContext } from "@/lib/data";
import { JOB_HISTORY_LIMIT } from "@/lib/domain/panel-job";
import { PANEL_JARGON } from "@/lib/plain-language";

const START_BUTTONS = ["Önce bak", "Başlat", "Hesaba bak", "Videoları incele", "Açıları etiketle", "Planı hazırla", "Notları güncelle", "Sonuçları ölç"];

/** `/isler`'i gerçek (örnek) depoyla çizer. `operator`: yönetici modu · aksi halde müşteri görünümü. */
async function renderPage(operator: boolean) {
  vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
  return render(await JobsPage());
}

beforeEach(() => {
  availability.current = { available: true };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ workerNeeded: false }) }));
  jobStatusStore.reset();
});

afterEach(() => {
  jobStatusStore.reset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/isler: müşteri görünümü", () => {
  it("düğme çizilmez; sayfa bunu düz dille söyler; geçmişte tutar, sağlayıcı, ham not, günlük ve komut YOK", async () => {
    const { container } = await renderPage(false);
    expect(screen.getByRole("note")).toHaveTextContent("İşleri yöneticin başlatır");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=jobs-start]")).toBeNull();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$|USD|Apify|agy|Günlük|npm run|worker_lost|docs\/rutin|Terminal/);
    expect(text).not.toMatch(PANEL_JARGON);
    expect(container.querySelector("[data-operator]")).toBeNull();
    // Geçmiş yine görünür: tür, durum ve sonuç cümlesi sözlükten.
    expect(document.querySelectorAll("[data-slot=job-history] > li").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Bu iş onaylanan sınırı aşacaktı; başlamadım.")).toBeInTheDocument();
    expect(screen.getByText("Çalışan ya da sırada bekleyen bir iş yok.")).toBeInTheDocument();
  });
});

describe("/isler: yönetici", () => {
  it("işler kapalıyken (örnek veri) düğme çizilmez, nedeni yazılır; yönetici ayrıntısı geçmişte durur", async () => {
    availability.current = { available: false, reason: "data_source" };
    await renderPage(true);
    expect(screen.getByRole("note")).toHaveTextContent("Örnek veriyle çalışıyorsun");
    for (const name of START_BUTTONS) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yeniden başlat" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Günlük (son satırlar)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0,13").length).toBeGreaterThan(0);
  });

  it.each(["hosted", "worker_missing", "not_ready"])("işler kapalı (%s): düğme yok, açıklama var", async (reason) => {
    availability.current = { available: false, reason };
    await renderPage(true);
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Başlat" })).not.toBeInTheDocument();
  });

  it("işler açıkken: haftalık tur + tek tek işler + geçmiş; kapalı notu yok; tek hesapta 'Tüm hesaplar' çizilmez", async () => {
    await renderPage(true);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    for (const name of START_BUTTONS) expect(screen.getByRole("button", { name })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Tüm hesaplar için başlat" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Geçmiş" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-slot=job-history] > li").length).toBeLessThanOrEqual(JOB_HISTORY_LIMIT);
    // Son iş tamamlanmadıysa (örnek veride tutarı aşıp duran toplama) yeniden başlatılabilir.
    const latest = within(document.querySelector("[data-slot=job-history] > li") as HTMLElement);
    expect(latest.getByText("durdu")).toBeInTheDocument();
    expect(latest.getByRole("button", { name: "Yeniden başlat" })).toBeEnabled();
  });

  it("haftalık turun tutar alanı son toplama tahmininden önerilir", async () => {
    const user = userEvent.setup();
    await renderPage(true);
    await user.click(screen.getByRole("checkbox", { name: "Yeni veri de topla (para harcar)" }));
    expect(screen.getByLabelText("En çok harcanacak tutar (USD)")).toHaveValue("0,15");
  });

  it("sırada iş varken: canlı panel işi gösterir, yeni iş düğmeleri kapalıdır", async () => {
    const { repo, wsId } = await getPanelContext();
    const job = await repo.requestJob(wsId, { kind: "analyze" });
    try {
      await renderPage(true);
      expect(document.querySelector("[data-slot=live-job]")).toHaveAttribute("data-state", "queued");
      expect(screen.getByText("Sıradaki iş: Videoları incele")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled();
      for (const name of START_BUTTONS) expect(screen.getByRole("button", { name })).toBeDisabled();
      // Etkin iş geçmişte ayrıca listelenmez.
      expect(document.querySelector(`[data-slot=job-history] [data-job=${job.id}]`)).toBeNull();
    } finally {
      await repo.cancelJob(wsId, job.id);
    }
  });
});
