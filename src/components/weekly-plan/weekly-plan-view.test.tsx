// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/studio-orders", () => ({ createStudioOrderAction: vi.fn() }));
// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { PlanEmptyState } from "@/components/weekly-plan/plan-empty-state";
import { makePlan } from "@/components/weekly-plan/test-fixtures";
import { WeeklyPlanView } from "@/components/weekly-plan/weekly-plan-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PANEL_JARGON } from "@/lib/plain-language";

const renderPlan = (plan = makePlan()) =>
  render(
    <TooltipProvider>
      <WeeklyPlanView plan={plan} />
    </TooltipProvider>,
  );

describe("WeeklyPlanView", () => {
  it("her plan öğesinde tek fiş düğmesi: fişi olana 'Fişi aç' bağlantısı, olmayana 'Fiş hazırla'", () => {
    render(
      <TooltipProvider>
        <WeeklyPlanView plan={makePlan()} orderIdByIdea={{ "idea-1": "so_1" }} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("link", { name: "Fişi aç" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Fişi aç" })).toHaveAttribute("href", "/fis/so_1");
    expect(screen.getAllByRole("button", { name: "Fiş hazırla" })).toHaveLength(3);
  });

  it("altı bölümü sırayla çizer", () => {
    renderPlan();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "5 Eki – 11 Eki 2026 haftası",
      "Ne tuttu",
      "Bu hafta neye yüklen",
      "İçerikler",
      "Takvim",
      "Kaçın",
      "Geçen hafta",
    ]);
  });

  it("slot zamanı New York saati + İstanbul karşılığı olarak görünür; takvim 7 gün çizer", () => {
    renderPlan();
    expect(screen.getAllByText(/Per 19:00 ET/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cum 02:00 İstanbul/).length).toBeGreaterThan(0);
    const calendar = within(screen.getByRole("list", { name: "Haftalık takvim" })).getAllByRole("listitem", {});
    // 7 gün kutusu (içlerindeki slot listeleri ayrı listitem'lar: en az 7).
    expect(calendar.length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText("Perşembe")).toBeInTheDocument();
  });

  it("içerik kartı: hook'lar, kapalı açılır script, açıklama taslağı ve kanıt bağlantısı", () => {
    renderPlan();
    expect(screen.getAllByText("Cümle 1-a").length).toBe(1);
    const details = screen.getAllByText("Script ve açıklama taslağı")[0].closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Script 1 birinci satır");
    expect(details).toHaveTextContent("Açıklama 1");
    const links = screen.getAllByRole("link", { name: /@rakip · Alt yazı 1/ });
    expect(links[0]).toHaveAttribute("href", "/video/c-1");
  });

  it("yedekte bekleyenler plandaki içeriklerden ayrı, sade listelenir (puan ve 'aday' yok)", () => {
    renderPlan();
    const alternatives = screen.getByRole("heading", { name: "Yedekte bekleyenler" }).parentElement as HTMLElement;
    expect(within(alternatives).getByText("Fikir 5")).toBeInTheDocument();
    expect(alternatives).toHaveTextContent("1 videoya dayanıyor");
    expect(alternatives).not.toHaveTextContent(/puan/i);
    // Yedek kartında açılış cümlesi listesi/script yok.
    expect(screen.queryByText("Cümle 5-a")).not.toBeInTheDocument();
  });

  it("yön: düz cümleler (normalinin katı, kaç videoya dayandığı, denenip denenmediği); alıntı ayrı; sunucu gerekçesi çizilmez", () => {
    renderPlan();
    const direction = screen.getByRole("heading", { name: "Soru" }).closest("[data-slot=card]") as HTMLElement;
    expect(direction).toHaveTextContent("Rakiplerde tipik video normalinin 4,2 katı izlendi. 12 videoya dayanıyor. Sen bunu henüz denemedin.");
    expect(direction).not.toHaveTextContent("Yön gerekçesi metni");
    expect(within(direction).getByText("Kısmen eminim")).toBeInTheDocument();
    expect(screen.getByText(/Yön alıntısı/).closest("blockquote")).toBeInTheDocument();
    for (const label of ["Etki", "Yenilik", "Puan", "Örnek"]) expect(within(direction).queryByText(label)).not.toBeInTheDocument();
  });

  it("dayandığı video bağlantıları görünen adla ve hangi yöne ait olduğunu söyleyen gizli ekle", () => {
    renderPlan();
    const direction = screen.getByRole("heading", { name: "Soru" }).closest("[data-slot=card]") as HTMLElement;
    const link = within(direction).getByRole("link", { name: /^1\. video/ });
    expect(link.textContent).toBe("1. video Soru yönünün dayanağı");
    expect(link).toHaveAttribute("href", "/video/c-1");
    expect(link.parentElement).toHaveClass("[&_a]:min-h-tap");
  });

  it("ölçülemeyen değerler tire olur; 0 / 0,00 yazılmaz", () => {
    renderPlan();
    // c-2: izlenme, süre, hook ölçülemedi.
    const card = screen.getByRole("link", { name: "@rakip2" }).closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(card).toHaveTextContent("Video henüz incelenmedi");
    // Etkisi ölçülemeyen yön "0 kat" değil tire + sebep yazar.
    const direction = screen.getByRole("heading", { name: "DM'e çağrı" }).closest("[data-slot=card]") as HTMLElement;
    expect(within(direction).getByText("—")).toBeInTheDocument();
    expect(direction).toHaveTextContent("Rakiplerde ne kadar tuttuğunu ölçemedim.");
    expect(screen.queryByText("0,00")).not.toBeInTheDocument();
  });

  it("güven rozeti her yerde aynı sözlükten: yüksek örnekli ama orta güven → uyarılı; az örnek → 'az örnek, emin değilim'", () => {
    renderPlan();
    expect(screen.getByLabelText(/^Kısmen eminim: Karşılaştırma için baktığım videolar az/)).toBeInTheDocument();
    expect(screen.getByText("Az örnek, emin değilim")).toBeInTheDocument();
    expect(screen.queryByText(/güven$/)).not.toBeInTheDocument();
  });

  it("panel jargonu çizilen metinde yok (Bu hafta ekranı)", () => {
    const { container } = renderPlan();
    expect(container.textContent ?? "").not.toMatch(PANEL_JARGON);
  });

  it("geçen hafta sonucu verilmediyse bölüm 'henüz okunamıyor' der (plan yine çizilir)", () => {
    renderPlan();
    expect(screen.getByText("Geçen hafta sonucu bu veri kaynağında henüz okunamıyor.")).toBeInTheDocument();
  });
});

describe("PlanEmptyState", () => {
  it("hiç plan yokken 'Planı hazırla' iş düğmesini verir (varsayılan hafta); komut metni yok", () => {
    render(<PlanEmptyState hasOtherPlans={false} />);
    expect(screen.getByText("Henüz plan yok")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Planı hazırla" });
    expect(button).toHaveAttribute("data-kind", "plan");
    expect(button).not.toHaveAttribute("data-week");
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("istenen haftanın planı yoksa haftayı söyler, O haftanın planını hazırlatır ve en son plana götürür", () => {
    render(<PlanEmptyState requestedWeek="2026-10-12" hasOtherPlans />);
    expect(screen.getByText("12 Eki – 18 Eki 2026 haftası için plan yok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toHaveAttribute("data-week", "2026-10-12");
    expect(screen.getByRole("link", { name: "En son planı göster" })).toHaveAttribute("href", "/bu-hafta");
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
  });
});
