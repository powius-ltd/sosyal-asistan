// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { switchWorkspace, createWorkspaceAndSwitch, push, toast } = vi.hoisted(() => ({
  switchWorkspace: vi.fn(),
  createWorkspaceAndSwitch: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/actions/workspace", () => ({ switchWorkspace, createWorkspaceAndSwitch }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast }));

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { FirstStepsCard } from "@/components/workspace/first-steps-card";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";

const WORKSPACES = [
  { id: "ws-a", name: "Ornek" },
  { id: "ws-b", name: "Kahve Dükkanı" },
];

beforeEach(() => {
  vi.clearAllMocks();
  switchWorkspace.mockResolvedValue({ ok: true });
  createWorkspaceAndSwitch.mockResolvedValue({ ok: true, workspaceId: "ws-c", name: "Yeni", slug: "yeni" });
});

// Üst çubuktaki hesap seçici (`shell/account-switcher.tsx`) `components/shell/shell.test.tsx`'te sınanır.

describe("WorkspaceSwitcher", () => {
  it("seçim server action'ı kimlikle çağırır; geçerli çalışma alanı yeniden seçilirse çağrılmaz", async () => {
    const user = userEvent.setup({ delay: null });
    render(<WorkspaceSwitcher current="ws-a" workspaces={WORKSPACES} />);
    const trigger = screen.getByRole("combobox", { name: "Çalışma alanı" });
    expect(trigger).toHaveTextContent("Ornek");

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Ornek" }));
    expect(switchWorkspace).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Kahve Dükkanı" }));
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: "ws-b" }));
  });

  it("action hata dönerse Türkçe hata bildirimi gösterilir", async () => {
    switchWorkspace.mockResolvedValue({ ok: false, code: "invalid_state", message: "Çalışma alanı geçişi bu ortamda kapalı." });
    const user = userEvent.setup({ delay: null });
    render(<WorkspaceSwitcher current="ws-a" workspaces={WORKSPACES} />);
    await user.click(screen.getByRole("combobox", { name: "Çalışma alanı" }));
    await user.click(await screen.findByRole("option", { name: "Kahve Dükkanı" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Çalışma alanı geçişi bu ortamda kapalı."));
  });

  it("'Yeni çalışma alanı' Ayarlar'daki forma götürür (action çağrılmaz)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<WorkspaceSwitcher current="ws-a" workspaces={WORKSPACES} />);
    await user.click(screen.getByRole("combobox", { name: "Çalışma alanı" }));
    await user.click(await screen.findByRole("option", { name: /Yeni çalışma alanı/ }));
    expect(push).toHaveBeenCalledWith("/ayarlar#calisma-alanlari");
    expect(switchWorkspace).not.toHaveBeenCalled();
  });
});

describe("CreateWorkspaceForm", () => {
  const platforms = [{ value: "instagram", label: "Instagram" }];

  it("alanları sunucu action'ına gönderir; başarıda toast ve ilk adımlar kutusuna yönlendirme", async () => {
    const user = userEvent.setup({ delay: null });
    render(<CreateWorkspaceForm platforms={platforms} />);
    await user.type(screen.getByLabelText("Çalışma alanı adı"), "Kahve Dükkanı");
    await user.type(screen.getByLabelText("Kendi hesabın (kullanıcı adı)"), "@kahve");
    await user.click(screen.getByRole("button", { name: "Çalışma alanı oluştur" }));

    await waitFor(() => expect(createWorkspaceAndSwitch).toHaveBeenCalledTimes(1));
    expect(createWorkspaceAndSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Kahve Dükkanı", handle: "@kahve", platform: "instagram", complianceRegion: "TR" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ayarlar#ilk-adimlar"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("sunucu doğrulama hatasını (Türkçe) gösterir ve yönlendirmez", async () => {
    createWorkspaceAndSwitch.mockResolvedValue({ ok: false, code: "invalid_input", message: "Kullanıcı adı yalnız harf, rakam, nokta, alt çizgi ve tire içerebilir (en çok 50 karakter)." });
    const user = userEvent.setup({ delay: null });
    render(<CreateWorkspaceForm platforms={platforms} />);
    await user.type(screen.getByLabelText("Çalışma alanı adı"), "X");
    await user.type(screen.getByLabelText("Kendi hesabın (kullanıcı adı)"), "kötü ad");
    await user.click(screen.getByRole("button", { name: "Çalışma alanı oluştur" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Kullanıcı adı/)));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("FirstStepsCard", () => {
  it("başlangıç akışına yönlendirir; eski elle yol (rakip ekle → önce bak → veriyi getir + tur) yöneticiye kapalı bölümde kalır", () => {
    render(<FirstStepsCard workspace={{ id: "ws-1", slug: "kahve-dukkani" }} workspaceName="Kahve Dükkanı" />);
    expect(screen.getByText("İlk adımlar: Kahve Dükkanı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İlk bakışı birlikte tamamlayalım" })).toHaveAttribute("href", "/baslangic");
    expect(document.querySelector('[data-slot="first-steps-manual"]')).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Rakipler" })).toHaveAttribute("href", "/rakipler");

    const jobs = [...document.querySelectorAll<HTMLElement>('[data-slot="job-command"]')];
    expect(jobs.map((button) => button.textContent)).toEqual(["Önce bak", "Hesaba bak", "Başlat"]);
    const [preview, collect, start] = jobs;
    expect(preview).toHaveAttribute("data-kind", "routine");
    expect(preview).toHaveAttribute("data-dry-run", "true");
    // Para harcayan adım ayrı bir iştir (onay penceresini düğme açar); tur onaysız başlar ve para harcamaz.
    expect(collect).toHaveAttribute("data-kind", "collect");
    expect(start).toHaveAttribute("data-kind", "routine");
    expect(start).toHaveAttribute("data-dry-run", "false");
    expect(start).toHaveAttribute("data-variant", "outline");
    expect(screen.getByTestId("first-steps")).not.toHaveTextContent(/npm run/);
  });

  it("işler kapalıyken kalan yedek: iki komut (ön bakış, tutarlı tur) çalışma alanıyla; para uyarısı yalnız yedekte", () => {
    render(<FirstStepsCard workspace={{ id: "ws-1", slug: "kahve-dukkani" }} workspaceName="Kahve Dükkanı" />);
    const [preview, , start] = [...document.querySelectorAll<HTMLElement>('[data-slot="job-command"]')];
    for (const button of [preview, start]) expect(button).toHaveAttribute("data-workspace", "kahve-dukkani");
    expect(start).toHaveAttribute("data-flags", "--apify-max=0.5");
    // Üç düğme, iki yedek: "Hesaba bak"ın ayrı yedeği yok (toplamayı turun komutu kapsar). Yedekler yer tutucuda gizli yuvadadır.
    const fallbacks = [...document.querySelectorAll<HTMLElement>('[data-slot="job-command-fallback"]')];
    expect(fallbacks).toHaveLength(2);
    expect(fallbacks[1]).toHaveTextContent("Para harcar");
    expect(screen.getByText("Para harcar")).not.toBeVisible();
  });
});
