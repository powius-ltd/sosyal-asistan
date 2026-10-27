// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/sonuclar" }));
// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn() }));

import ResultsPage from "@/app/(panel)/sonuclar/page";
import { TooltipProvider } from "@/components/ui/tooltip";

// jsdom'da ResizeObserver yok; grafik (recharts) sayfada çizilir.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => vi.unstubAllEnvs());

/** Sonuçlar sayfasını gerçek (mock) depoyla çizer. `operator`: OPERATOR_MODE=local (yönetici) · aksi halde müşteri görünümü. */
async function renderResults(operator: boolean, searchParams: Record<string, string | string[] | undefined> = {}) {
  vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
  const element = await ResultsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });
  return render(<TooltipProvider>{element}</TooltipProvider>);
}

const headingOf = (title: string) => screen.getByText(title, { selector: '[data-slot="card-title"], [data-slot="card-title"] *' });

describe("Sonuçlar sayfası (mock veri; eski 'Ayrıntılar' bölümünün yeni yeri)", () => {
  it("başlık 'Sonuçlar'; sayılar, notların tamamı, grafikler ve en iyi saatler açık durur (kapalı bölüm yok)", async () => {
    const { container } = await renderResults(false);
    expect(screen.getByRole("heading", { level: 1, name: "Sonuçlar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sayılar" })).toBeInTheDocument();
    expect(headingOf("Notlar")).toBeInTheDocument();
    expect(container.querySelector("details[data-testid='overview-details']")).toBeNull();
    expect(screen.queryByText("Apify maliyeti")).not.toBeInTheDocument();
  });

  it("müşteri görünümünde yönetici bilgisi yok (komut, dayanak sayımı); yönetici modunda dayanak ve 'Notları güncelle' düğmesi küçük ve ikincil görünür", async () => {
    const customer = await renderResults(false);
    expect(customer.container.textContent).not.toMatch(/npm run|Apify/);
    expect(customer.container.querySelector('[data-slot="briefing-footer"]')).toBeNull();
    customer.unmount();

    const { container } = await renderResults(true);
    const footer = container.querySelector<HTMLElement>('[data-slot="briefing-footer"]')!;
    expect(footer).toHaveTextContent(/dayandığı veri: \d+ analiz, \d+ etiket/);
    expect(within(footer).getByRole("button", { name: "Notları güncelle" })).toHaveAttribute("data-kind", "briefing");
    expect(container.textContent).not.toMatch(/npm run/);
  });
});
