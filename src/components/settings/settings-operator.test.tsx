// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/settings", () => ({
  updateWorkspaceSettings: vi.fn(),
  updateMeasureCap: vi.fn(),
  updateAlertSettings: vi.fn(),
  updateComplianceRegion: vi.fn(),
  updateContentLanguage: vi.fn(),
  updateAccountType: vi.fn(),
}));
vi.mock("@/app/actions/workspace", () => ({ switchWorkspace: vi.fn(), createWorkspaceAndSwitch: vi.fn() }));
// Uyarı ayarları bölümü async sunucu bileşenidir (jsdom'da eşzamanlı çizilemez); bu testin konusu değil.
vi.mock("@/components/settings/alert-settings-section", () => ({ AlertSettingsSection: () => null }));
// Ölçüm tavanı kartındaki iş düğmesi de async sunucu bileşeni taşır: yer tutucuyla değişir (kapı `workspace/job-command.test.tsx`'te).
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/ayarlar" }));

import SettingsPage from "@/app/(panel)/ayarlar/page";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => vi.unstubAllEnvs());

/** Ayarlar'ı gerçek (mock) depoyla çizer. `operator`: OPERATOR_MODE=local (yönetici) · aksi halde müşteri görünümü. */
async function renderSettings(operator: boolean) {
  vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
  const element = await SettingsPage();
  return render(<TooltipProvider>{element}</TooltipProvider>);
}

const OPERATOR_ONLY_SECTIONS = ["Aylık maliyet", "Entegrasyon durumu", "Ölçüm tavanı", "Son koşular"];

describe("Ayarlar: yönetici bilgisi yalnız operatör modunda", () => {
  it("müşteri görünümünde Apify/maliyet/koşu/komut içeren bölümler çizilmez", async () => {
    const { container } = await renderSettings(false);
    for (const title of OPERATOR_ONLY_SECTIONS) expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aylık Apify tavanı (USD)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aylık LLM tavanı (USD)")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Apify|npm run/);
    expect(container.textContent).not.toContain("API fiyatıyla tutardı");
  });

  it("müşteri görünümünde panel jargonu, 'Faz' yazısı, ham saat dilimi ve veritabanı adı yok (D3-09)", async () => {
    const { container } = await renderSettings(false);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Faz \d|Europe\/|Workspace|LLM|baz çizgisi|\bHook\b|OAuth/);
    expect(text).not.toMatch(/social_accounts|competitors\.|content_items|missing_fields|avgWatchSec|postsCount/);
    // Ölçülemeyenler: ham tablo yok, kısa özet var.
    expect(container.querySelector("table")).toBeNull();
    const lines = container.querySelectorAll("[data-testid='unmeasured-summary'] li");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it("yönetici modunda ham ölçülemeyen tablosu, Workspace başlığı ve Faz notları durur (D3-09)", async () => {
    const { container } = await renderSettings(true);
    expect(screen.getByText("Workspace ayarları")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='unmeasured-summary']")).toBeNull();
    expect(container.textContent).toMatch(/Faz 4/);
  });

  it("müşteri görünümünde müşteriyi ilgilendiren bölümler durur: niş tanımı ve kaydet düğmesi", async () => {
    await renderSettings(false);
    expect(screen.getByText("Hesap ayarları")).toBeInTheDocument();
    expect(screen.queryByText("Workspace ayarları")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Niş tanımı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });

  it("operatör modunda maliyet, entegrasyon, ölçüm tavanı, koşu tablosu ve tavan alanları görünür", async () => {
    await renderSettings(true);
    for (const title of OPERATOR_ONLY_SECTIONS) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByLabelText("Aylık Apify tavanı (USD)")).toBeInTheDocument();
    expect(screen.getByLabelText("Aylık LLM tavanı (USD)")).toBeInTheDocument();
  });

  it("operatör modunda aylık maliyette abonelik çağrılarının 'API fiyatıyla tutardı' satırı görünür", async () => {
    const { container } = await renderSettings(true);
    expect(container.querySelector("[data-slot='shadow-cost']")?.textContent).toMatch(/API fiyatıyla tutardı:\s*≈/);
  });

  it("ölçüm tavanı kartında komut metni yerine 'Sonuçları ölç' iş düğmesi vardır; müşteri görünümünde düğme de yok", async () => {
    const operator = await renderSettings(true);
    expect(screen.getByRole("button", { name: "Sonuçları ölç" })).toHaveAttribute("data-kind", "measure");
    expect(operator.container.textContent).not.toMatch(/npm run/);
    operator.unmount();

    await renderSettings(false);
    expect(screen.queryByRole("button", { name: "Sonuçları ölç" })).not.toBeInTheDocument();
  });
});
