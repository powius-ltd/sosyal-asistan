// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const replace = vi.fn();
vi.mock("@/app/actions/publish", () => ({
  submitPublishJob: vi.fn(),
  approvePublishJob: vi.fn(),
  cancelPublishJob: vi.fn(),
  createPublishJob: (...args: unknown[]) => create(...args),
}));
vi.mock("@/app/actions/publish-replace", () => ({ replacePublishJob: (...args: unknown[]) => replace(...args) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m), warning: (m: string) => toastWarning(m) } }));

import { CreatePublishDialog } from "@/components/publish/create-job-dialog";
import { PublishJobCard, type PublishFixSettings } from "@/components/publish/job-card";
import { buildJobViews } from "@/components/publish/job-views";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PublishJob, PublishStatus } from "@/lib/domain/publish";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const accounts = [{ id: "oa_1", handle: "bahcekafe.ist", platform: "instagram" as const }];
const settings: PublishFixSettings = { accounts, complianceRegion: "TR", operator: false, now: NOW };

function jobOf(status: PublishStatus, patch: Partial<PublishJob> = {}): PublishJob {
  return {
    id: "pj_1",
    workspaceId: "ws_1",
    socialAccountId: "oa_1",
    platform: "instagram",
    status,
    caption: "Eski açıklama #kahve",
    shareToFeed: true,
    paidPartnership: false,
    aiGenerated: false,
    attemptCount: 0,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...patch,
  };
}

function renderCard(job: PublishJob, fixSettings: PublishFixSettings | undefined = settings) {
  const [view] = buildJobViews([job], [{ id: "oa_1", handle: "bahcekafe.ist" }], [], "TR");
  return render(
    <TooltipProvider>
      <ul>
        <PublishJobCard view={view!} timeZone="Europe/Istanbul" fixSettings={fixSettings} />
      </ul>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  create.mockReset();
  replace.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
});

describe("Kopyala ve düzelt / Yeniden dene (D2-01, D2-06)", () => {
  it("onay bekleyen, süresi dolan ve taslak işte 'Kopyala ve düzelt'; başarısızda 'Yeniden dene'; diğerlerinde yok", () => {
    for (const [status, label] of [
      ["awaiting_approval", "Kopyala ve düzelt"],
      ["expired", "Kopyala ve düzelt"],
      ["draft", "Kopyala ve düzelt"],
      ["failed", "Yeniden dene"],
    ] as const) {
      const { unmount } = renderCard(jobOf(status));
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      unmount();
    }
    for (const status of ["approved", "container_pending", "ready", "publishing", "published", "cancelled"] as const) {
      const { unmount } = renderCard(jobOf(status));
      expect(screen.queryByRole("button", { name: /Kopyala ve düzelt|Yeniden dene/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("onay bekleyen olmayan kartlarda soluk 'Onayla' düğmesi çizilmez; iptal edilemeyen kartta hiç düğme yok", () => {
    for (const status of ["failed", "expired", "approved", "published", "cancelled"] as const) {
      const { unmount } = renderCard(jobOf(status));
      expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
      unmount();
    }
    renderCard(jobOf("published"));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("yayın açabilen hesap yoksa düzeltme düğmesi çizilmez (form kurulamaz)", () => {
    renderCard(jobOf("failed"), { ...settings, accounts: [] });
    expect(screen.queryByRole("button", { name: "Yeniden dene" })).not.toBeInTheDocument();
  });

  it("form o işin alanlarıyla dolu açılır; kaydedince TEK action çağrılır (eski iş kimliği + yeni alanlar)", async () => {
    replace.mockResolvedValue({ ok: true, oldCancelled: true });
    const user = userEvent.setup();
    renderCard(jobOf("failed", { scheduledFor: "2026-10-09T15:00:00.000Z", aiGenerated: true, error: "Meta API videoyu işleyemedi: en-boy oranı 9:16 olmalı." }));

    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(await screen.findByRole("heading", { name: "Yeniden dene" })).toBeInTheDocument();
    expect(screen.getByLabelText("Açıklama")).toHaveValue("Eski açıklama #kahve");
    expect(screen.getByLabelText("Planlanan zaman")).toHaveValue("2026-10-09T18:00"); // workspace saat dilimi
    expect(screen.getByRole("switch", { name: "Yapay zekâ ile üretildi" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveTextContent("@bahcekafe.ist");

    await user.clear(screen.getByLabelText("Açıklama"));
    await user.click(screen.getByLabelText("Açıklama"));
    await user.paste("Yapay zekâ ile üretildi. Yeni açıklama");
    await user.click(screen.getByRole("button", { name: "Taslak kaydet" }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(create).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith({
      replacesJobId: "pj_1",
      job: expect.objectContaining({ socialAccountId: "oa_1", caption: "Yapay zekâ ile üretildi. Yeni açıklama", scheduledAt: "2026-10-09T18:00", aiGenerated: true, status: "draft" }),
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Yeni yayın kaydedildi, eski iş iptal edildi."));
  });

  it("geçmişe düşmüş planlanan zaman forma taşınmaz", async () => {
    const user = userEvent.setup();
    renderCard(jobOf("expired", { scheduledFor: "2026-10-01T15:00:00.000Z" }));
    await user.click(screen.getByRole("button", { name: "Kopyala ve düzelt" }));
    expect(await screen.findByLabelText("Planlanan zaman")).toHaveValue("");
  });

  it("eski iş iptal edilemediyse uyarı verilir (yeni iş kaydedildi)", async () => {
    replace.mockResolvedValue({ ok: true, oldCancelled: false });
    const user = userEvent.setup();
    renderCard(jobOf("awaiting_approval"));
    await user.click(screen.getByRole("button", { name: "Kopyala ve düzelt" }));
    await user.click(await screen.findByRole("button", { name: "Taslak kaydet" }));
    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining("eski iş iptal edilemedi")));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("uyum engelli onay bekleyen kart: sebep yazılı, Onayla yok, 'Kopyala ve düzelt' birincil; adresteki ?duzelt= formu açık getirir", async () => {
    const blocked = jobOf("awaiting_approval", { paidPartnership: true, caption: "Harika ürün" });
    renderCard(blocked, { ...settings, fixJobId: "pj_1" });
    expect(screen.getByText(/Önce düzeltilmesi gerekiyor:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Kopyala ve düzelt" })).toBeInTheDocument();
    expect(screen.getByLabelText("Açıklama")).toHaveValue("Harika ürün");
  });

  it("başka işin kimliğiyle gelen ?duzelt= formu açmaz; ham hata metni düz dile çevrilir", () => {
    renderCard(jobOf("failed", { error: "Container 24 saat içinde yayınlanmadı ve süresi doldu; yeniden oluşturulması gerekiyor." }), { ...settings, fixJobId: "baska" });
    expect(screen.queryByRole("heading", { name: "Yeniden dene" })).not.toBeInTheDocument();
    expect(screen.getByText(/Yayın süresi doldu: video 24 saat içinde yayınlanmadı/)).toBeInTheDocument();
    expect(screen.queryByText(/Container/)).not.toBeInTheDocument();
  });

  it("müşteri görünümünde 'Onaylayan' kimliği ve kural kodu yok; yönetici modunda var", () => {
    const approved = jobOf("approved", { approvedAt: "2026-10-02T09:00:00.000Z", approvedBy: "mock-user" });
    const { unmount } = renderCard(approved);
    expect(screen.queryByText(/Onaylayan/)).not.toBeInTheDocument();
    unmount();
    renderCard(approved, { ...settings, operator: true });
    expect(screen.getByText("Onaylayan: mock-user")).toBeInTheDocument();
  });
});

describe("Yeni yayın formu: hata alanın yanında (D2-09)", () => {
  const twoAccounts = [...accounts, { id: "oa_2", handle: "ikinci.hesap", platform: "instagram" as const }];

  async function open(list = accounts) {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <CreatePublishDialog accounts={list} timeZone="Europe/Istanbul" complianceRegion="TR" />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Yeni yayın/ }));
    await screen.findByLabelText("Açıklama");
    return user;
  }

  it("tek hesapta hesap kendiliğinden seçili; iki hesapta boş", async () => {
    await open();
    expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveTextContent("@bahcekafe.ist");
  });

  it("iki hesapta seçilmeden gönderilirse hata hesap alanının altında, odak o alanda; istek gitmez", async () => {
    const user = await open(twoAccounts);
    await user.click(screen.getByRole("button", { name: "Taslak kaydet" }));
    expect(await screen.findByText("Hesap seç.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveFocus());
    expect(create).not.toHaveBeenCalled();
  });

  it("açıklama boşken 'Onaya gönder': hata alanın altında (aria-describedby), odak alanda, toast yok", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Onaya gönder" }));
    const message = await screen.findByText("Onaya göndermek için açıklama yaz.");
    const field = screen.getByLabelText("Açıklama");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    await waitFor(() => expect(field).toHaveFocus());
    expect(toastError).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("sınır aşılınca alan büyümez (üst sınır + kayma), sayaç görünür, neden alanın altında yazar", async () => {
    const user = await open();
    await user.click(screen.getByLabelText("Açıklama"));
    await user.paste("a".repeat(2310));
    const field = screen.getByLabelText("Açıklama");
    expect(field).toHaveClass("max-h-56", "overflow-y-auto");
    expect(field.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByText("2310 / 2200")).toBeInTheDocument();
    expect(screen.getByText(/2\.310 karakter; en fazla 2\.200 olabilir \(110 karakter fazla\)/)).toBeInTheDocument();
  });

  it("sunucudan dönen 'geçmişte olamaz' hatası planlanan zaman alanına bağlanır, odak oraya gider", async () => {
    create.mockResolvedValue({ ok: false, code: "invalid_input", message: "Planlanan zaman geçmişte olamaz." });
    const user = await open();
    await user.click(screen.getByLabelText("Açıklama"));
    await user.paste("Bir açıklama");
    await user.click(screen.getByRole("button", { name: "Taslak kaydet" }));
    const message = await screen.findByText("Planlanan zaman geçmişte olamaz.");
    const field = screen.getByLabelText("Planlanan zaman");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    await waitFor(() => expect(field).toHaveFocus());
    expect(toastError).not.toHaveBeenCalled();
  });
});
