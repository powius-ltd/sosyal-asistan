// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/app/actions/publish", () => ({
  submitPublishJob: vi.fn(),
  approvePublishJob: vi.fn(),
  cancelPublishJob: vi.fn(),
  createPublishJob: (...args: unknown[]) => create(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/app/actions/publish-replace", () => ({ replacePublishJob: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m), warning: vi.fn() } }));

import { CreatePublishDialog } from "@/components/publish/create-job-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComplianceRegion } from "@/lib/domain/compliance";

const accounts = [{ id: "oa_1", handle: "bahcekafe.ist", platform: "instagram" as const }];
type User = ReturnType<typeof userEvent.setup>;

async function openDialog(region: ComplianceRegion = "TR") {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <CreatePublishDialog accounts={accounts} timeZone="Europe/Istanbul" complianceRegion={region} />
    </TooltipProvider>,
  );
  await user.click(screen.getByRole("button", { name: /Yeni yayın/ }));
  await screen.findByRole("region", { name: "Uyum denetimi" });
  return user;
}

const panel = () => screen.getByRole("region", { name: "Uyum denetimi" });
const sw = (name: string) => screen.getByRole("switch", { name });

async function typeCaption(user: User, text: string) {
  await user.click(screen.getByLabelText("Açıklama"));
  await user.paste(text);
}

async function pickAccount(user: User) {
  await user.click(screen.getByRole("combobox", { name: "Hesap" }));
  await user.click(await screen.findByRole("option", { name: /@bahcekafe\.ist/ }));
}

beforeEach(() => {
  create.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe("CreatePublishDialog: alanlar", () => {
  it("üç anahtar var (Ücretli iş birliği, Yapay zekâ ile üretildi, Deneme yayını); reklam veren ve takipçilere açılma yalnız açılınca görünür", async () => {
    const user = await openDialog();
    expect(sw("Ücretli iş birliği")).not.toBeChecked();
    expect(sw("Yapay zekâ ile üretildi")).not.toBeChecked();
    expect(sw("Deneme yayını")).not.toBeChecked();
    expect(screen.getByText(/Önce yalnız seni takip etmeyenlere gösterilir; iki farklı açılışı karşılaştırmak için kullanışlıdır/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Reklam veren")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Takipçilere açılma")).not.toBeInTheDocument();

    await user.click(sw("Ücretli iş birliği"));
    expect(screen.getByLabelText("Reklam veren")).toBeInTheDocument();
    await user.click(sw("Deneme yayını"));
    expect(screen.getByLabelText("Takipçilere açılma")).toHaveTextContent("Takipçilere açmayı ben yaparım"); // varsayılan

    await user.click(sw("Ücretli iş birliği"));
    expect(screen.queryByLabelText("Reklam veren")).not.toBeInTheDocument();
  });

  it("takipçilere açılma seçenekleri: ben yaparım / kendiliğinden", async () => {
    const user = await openDialog();
    await user.click(sw("Deneme yayını"));
    await user.click(screen.getByLabelText("Takipçilere açılma"));
    expect(await screen.findByRole("option", { name: "Takipçilere açmayı ben yaparım" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "İyi giderse kendiliğinden açılır" }));
    expect(screen.getByLabelText("Takipçilere açılma")).toHaveTextContent("İyi giderse kendiliğinden açılır");
  });
});

describe("CreatePublishDialog: canlı uyum denetimi", () => {
  it("TR: ibaresiz ücretli iş birliği fail (Onaya gönder devre dışı, taslak açık); ibare + reklam veren eklenince ok", async () => {
    const user = await openDialog("TR");
    expect(panel()).toHaveAttribute("data-status", "ok"); // işaret yokken denetlenecek bir şey yok
    await pickAccount(user);

    await user.click(sw("Ücretli iş birliği"));
    expect(panel()).toHaveAttribute("data-status", "fail");
    expect(screen.getByText("Onaylanamaz")).toBeInTheDocument();
    expect(screen.getByText(/“Reklam” ya da “Tanıtım” ibaresi olmalı/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Taslak kaydet" })).toBeEnabled();

    await user.type(screen.getByLabelText("Reklam veren"), "Kahve Evi");
    await typeCaption(user, "Reklam · Kahve Evi ile birlikte");
    expect(screen.queryByText(/ibaresi olmalı/)).not.toBeInTheDocument();
    expect(panel()).toHaveAttribute("data-status", "ok");
    expect(screen.getByText("Uyumlu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeEnabled();
  });

  it("TR: ibare var ama reklam veren açıklamada yok → warn (Dikkat); uyarı engellemez", async () => {
    const user = await openDialog("TR");
    await pickAccount(user);
    await user.click(sw("Ücretli iş birliği"));
    await typeCaption(user, "Reklam · Harika kahve");
    expect(panel()).toHaveAttribute("data-status", "warn");
    expect(screen.getByText("Dikkat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onaya gönder" })).toBeEnabled();
  });

  it("TR: yapay zekâ işaretli ama beyan yok → fail; beyan yazılınca ok", async () => {
    const user = await openDialog("TR");
    await user.click(sw("Yapay zekâ ile üretildi"));
    expect(panel()).toHaveAttribute("data-status", "fail");
    expect(screen.getByText(/Yapay zekâ ile üretilmiş içerik için açık bir beyan yok/)).toBeInTheDocument();
    await typeCaption(user, "Bu video yapay zekâ ile üretildi.");
    expect(panel()).toHaveAttribute("data-status", "ok");
  });

  it("ABD: 'Reklam' ibaresi yetmez, #ad gerekir; #ad yazılınca ok; panelde bölge etiketi ABD", async () => {
    const user = await openDialog("US");
    expect(screen.getByText("Bölge: ABD")).toBeInTheDocument();
    await user.click(sw("Ücretli iş birliği"));
    await typeCaption(user, "Reklam · Harika kahve");
    expect(panel()).toHaveAttribute("data-status", "fail");
    expect(screen.getByText(/#ad, #sponsored/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Açıklama"));
    await typeCaption(user, "#ad Harika kahve");
    expect(panel()).toHaveAttribute("data-status", "ok");
  });

  it("TR+ABD: iki bölgenin kuralı birlikte çalışır", async () => {
    const user = await openDialog("TR_US");
    expect(screen.getByText("Bölge: TR+ABD")).toBeInTheDocument();
    await user.click(sw("Ücretli iş birliği"));
    await typeCaption(user, "Reklam · Harika kahve");
    expect(panel()).toHaveAttribute("data-status", "fail"); // TR tamam, ABD #ad ister
    await user.clear(screen.getByLabelText("Açıklama"));
    await typeCaption(user, "Reklam #ad Harika kahve");
    expect(panel()).not.toHaveAttribute("data-status", "fail");
  });
});

describe("CreatePublishDialog: gönderim", () => {
  it("yeni alanlar action'a geçer: ücretli iş birliği + reklam veren + YZ + deneme yayını (otomatik)", async () => {
    create.mockResolvedValue({ ok: true });
    const user = await openDialog("TR");
    await pickAccount(user);
    await user.click(sw("Ücretli iş birliği"));
    await user.type(screen.getByLabelText("Reklam veren"), "  Kahve Evi ");
    await user.click(sw("Yapay zekâ ile üretildi"));
    await user.click(sw("Deneme yayını"));
    await user.click(screen.getByLabelText("Takipçilere açılma"));
    await user.click(await screen.findByRole("option", { name: "İyi giderse kendiliğinden açılır" }));
    await typeCaption(user, "Reklam · Kahve Evi. Yapay zekâ ile üretildi.");

    await user.click(screen.getByRole("button", { name: "Onaya gönder" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      socialAccountId: "oa_1",
      caption: "Reklam · Kahve Evi. Yapay zekâ ile üretildi.",
      scheduledAt: "",
      paidPartnership: true,
      aiGenerated: true,
      advertiserName: "Kahve Evi",
      trial: { enabled: true, graduation: "performance" },
      status: "awaiting_approval",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Yayın onaya gönderildi."));
  });

  it("işaretsiz gönderimde reklam veren ve deneme yayını alanı yoktur (normal yayın)", async () => {
    create.mockResolvedValue({ ok: true });
    const user = await openDialog("TR");
    await pickAccount(user);
    await typeCaption(user, "Sade bir açıklama");
    await user.click(screen.getByRole("button", { name: "Taslak kaydet" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      socialAccountId: "oa_1",
      caption: "Sade bir açıklama",
      scheduledAt: "",
      paidPartnership: false,
      aiGenerated: false,
      status: "draft",
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Taslak kaydedildi."));
  });

  it("sunucu uyum hatası dönerse mesaj toast'ta gösterilir ve dialog açık kalır", async () => {
    const message = "Uyum denetimi başarısız: Ücretli iş birliğinde ilk satırda ibare olmalı. Açıklamayı düzeltip tekrar dene.";
    create.mockResolvedValue({ ok: false, code: "invalid_state", message });
    const user = await openDialog("TR");
    await pickAccount(user);
    await typeCaption(user, "Sade bir açıklama");
    await user.click(screen.getByRole("button", { name: "Onaya gönder" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(message));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Uyum denetimi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Açıklama")).toHaveValue("Sade bir açıklama"); // girilenler kaybolmaz
  });
});
