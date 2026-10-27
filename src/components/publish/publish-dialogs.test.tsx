// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approve = vi.fn();
const cancel = vi.fn();
const create = vi.fn();
const submit = vi.fn();
vi.mock("@/app/actions/publish", () => ({
  submitPublishJob: (...args: unknown[]) => submit(...args),
  approvePublishJob: (...args: unknown[]) => approve(...args),
  cancelPublishJob: (...args: unknown[]) => cancel(...args),
  createPublishJob: (...args: unknown[]) => create(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/app/actions/publish-replace", () => ({ replacePublishJob: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m), warning: vi.fn() } }));

import { CreatePublishDialog } from "@/components/publish/create-job-dialog";
import { JobActions } from "@/components/publish/job-actions";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComplianceResult } from "@/lib/domain/compliance";
import type { PublishStatus } from "@/lib/domain/publish";

const summary = { account: "@bahcekafe.ist", caption: "Kavurma dereceleri", when: "2 Eki 2026 18:00" };
const OK: ComplianceResult = { status: "ok", findings: [] };
const FAIL: ComplianceResult = {
  status: "fail",
  findings: [{ ruleId: "tr.ad-label", severity: "fail", message: "Ücretli iş birliğinde ilk satırda “Reklam” ibaresi olmalı.", hint: "İlk satıra “Reklam” yaz." }],
};

function renderActions(status: PublishStatus, hasCaption = true, compliance: ComplianceResult = OK) {
  return render(
    <TooltipProvider>
      <JobActions jobId="pj_9" status={status} hasCaption={hasCaption} compliance={compliance} complianceRegion="TR" summary={summary} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  approve.mockReset();
  cancel.mockReset();
  create.mockReset();
  submit.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("JobActions", () => {
  it("Onayla yalnız awaiting_approval iken etkin; Onaya gönder yalnız taslakta", () => {
    const draft = renderActions("draft");
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İptal" })).toBeEnabled();
    draft.unmount();

    renderActions("awaiting_approval");
    expect(screen.getByRole("button", { name: "Onayla" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Onaya gönder" })).not.toBeInTheDocument();
  });

  it("açıklaması boş taslak onaya gönderilemez (düğme devre dışı)", () => {
    renderActions("draft", false);
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeDisabled();
  });

  it("Onaya gönder: onay dialog'u olmadan action çağrılır (bu bir onay değildir), başarı toast'ı çıkar", async () => {
    submit.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderActions("draft");
    await user.click(screen.getByRole("button", { name: "Onaya gönder" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("pj_9"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Yayın onaya gönderildi."));
    expect(approve).not.toHaveBeenCalled();
  });

  it("Onaya gönder hata dönerse Türkçe hata toast'ı çıkar", async () => {
    submit.mockResolvedValue({ ok: false, message: "Onaya göndermek için açıklama yaz." });
    const user = userEvent.setup();
    renderActions("draft");
    await user.click(screen.getByRole("button", { name: "Onaya gönder" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Onaya göndermek için açıklama yaz."));
  });

  it("uyum denetimi fail iken taslağın 'Onaya gönder' düğmesi devre dışıdır ve sebep tooltip'te; action çağrılmaz", async () => {
    const user = userEvent.setup();
    renderActions("draft", true, FAIL);
    const button = screen.getByRole("button", { name: "Onaya gönder" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(submit).not.toHaveBeenCalled();
    // Sebep, ekran okuyucu için ipucu tetikleyicisinin adında da yer alır.
    expect(screen.getByLabelText(/^Onaya gönder devre dışı\. Uyum engeli: Ücretli iş birliğinde ilk satırda “Reklam” ibaresi olmalı/)).toBeInTheDocument();
  });

  it("uyum denetimi warn iken taslağın 'Onaya gönder' düğmesi etkin (uyarı engellemez)", () => {
    renderActions("draft", true, { status: "warn", findings: [{ ruleId: "tr.advertiser", severity: "warn", message: "Reklam veren görünmüyor." }] });
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeEnabled();
  });

  it("uyum denetimi fail iken onay bekleyen işte soluk Onayla çizilmez (D2-06); İptal kalır", () => {
    renderActions("awaiting_approval", true, FAIL);
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İptal" })).toBeEnabled();
    expect(approve).not.toHaveBeenCalled();
  });

  it("uyum denetimi ok/warn iken onay düğmesi etkin", async () => {
    const user = userEvent.setup();
    renderActions("awaiting_approval", true, { status: "warn", findings: [{ ruleId: "tr.advertiser", severity: "warn", message: "Reklam veren görünmüyor." }] });
    await user.click(screen.getByRole("button", { name: "Onayla" }));
    expect(await screen.findByText(/Reklam veren görünmüyor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla ve kuyruğa al" })).toBeEnabled();
  });

  it("geçerli olmayan düğme çizilmez: yayınlanmış işte hiçbir eylem düğmesi yok (durumu rozet söyler)", () => {
    const { unmount } = renderActions("published");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    renderActions("approved");
    expect(screen.queryByRole("button", { name: "Onayla" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İptal" })).toBeEnabled();
  });

  it("onay dialog'u açılır, onaylayınca action çağrılır ve başarı toast'ı çıkar", async () => {
    approve.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderActions("awaiting_approval");

    await user.click(screen.getByRole("button", { name: "Onayla" }));
    expect(await screen.findByText(/Bu videoyu yayın kuyruğuna onaylıyorsun/)).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled(); // dialog onayı beklenir

    await user.click(screen.getByRole("button", { name: "Onayla ve kuyruğa al" }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith("pj_9"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Yayın onaylandı ve kuyruğa alındı."));
  });

  it("action hata dönerse Türkçe hata toast'ı çıkar", async () => {
    approve.mockResolvedValue({ ok: false, message: "Bu işlem kaydın şu anki durumunda yapılamıyor." });
    const user = userEvent.setup();
    renderActions("awaiting_approval");

    await user.click(screen.getByRole("button", { name: "Onayla" }));
    await user.click(await screen.findByRole("button", { name: "Onayla ve kuyruğa al" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bu işlem kaydın şu anki durumunda yapılamıyor."));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("iptal dialog'u da onay ister", async () => {
    cancel.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderActions("draft");

    await user.click(screen.getByRole("button", { name: "İptal" }));
    expect(await screen.findByText(/Bu işlem geri alınamaz/)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "İşi iptal et" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("pj_9"));
  });
});

describe("CreatePublishDialog", () => {
  const accounts = [{ id: "oa_1", handle: "bahcekafe.ist", platform: "instagram" as const }];

  function renderDialog(list = accounts) {
    return render(
      <TooltipProvider>
        <CreatePublishDialog accounts={list} timeZone="Europe/Istanbul" complianceRegion="TR" />
      </TooltipProvider>,
    );
  }

  it("karakter sayacı, 30 hashtag uyarısı ve devre dışı video alanı gösterilir", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: /Yeni yayın/ }));

    expect(await screen.findByText("0 / 2200")).toBeInTheDocument();
    expect(screen.getByLabelText("Video dosyası")).toBeDisabled();
    expect(screen.getByText("Video yükleme yakında açılacak.")).toBeInTheDocument();

    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    await user.click(screen.getByLabelText("Açıklama"));
    await user.paste(tags);
    expect(screen.getByText(/31 hashtag var; en fazla 30 olabilir/)).toBeInTheDocument();
    // Düğmeler soluk kalmaz: tıklayınca neden alanın altında yazılır ve odak alana gider; istek gitmez.
    await user.click(screen.getByRole("button", { name: "Taslak kaydet" }));
    expect(create).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Açıklama")).toHaveFocus());
  });

  it("bağlı hesap yoksa yönlendirme mesajı gösterir ve gönderim düğmesi yoktur", async () => {
    const user = userEvent.setup();
    renderDialog([]);
    await user.click(screen.getByRole("button", { name: /Yeni yayın/ }));
    expect(await screen.findByText(/resmi bağlantıyla bağlı bir hesap gerekir/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onaya gönder" })).not.toBeInTheDocument();
  });
});

describe("JobActions: Zernio'da zamanlanmış gönderi (K2)", () => {
  it("containerId dolu satırda İptal düğmesi yok, Zernio notu var; containerId'siz approved iptal edilebilir", () => {
    const scheduled = render(
      <TooltipProvider>
        <JobActions jobId="pj_9" status={"ready" as PublishStatus} containerId="z-1" hasCaption compliance={OK} complianceRegion="TR" summary={summary} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "İptal" })).not.toBeInTheDocument();
    expect(screen.getByText(/Zernio'dan silinmeli/)).toBeInTheDocument();
    scheduled.unmount();
    renderActions("approved");
    expect(screen.getByRole("button", { name: "İptal" })).toBeEnabled();
  });
});
