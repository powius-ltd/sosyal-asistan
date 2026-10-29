// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ current: { available: false, reason: "data_source" } as { available: true } | { available: false; reason: string } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
// İşlerin ortam kapısı (örnek veride kapalıdır): "işler açık" durumunu sınamak için değiştirilir.
vi.mock("@/lib/job-control/availability", () => ({ jobsAvailability: () => availability.current }));
vi.mock("@/app/actions/jobs", () => ({ requestJobAction: vi.fn() }));
// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import TodayPage from "@/app/(panel)/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getPanelContext } from "@/lib/data";

afterEach(() => {
  vi.unstubAllEnvs();
  availability.current = { available: false, reason: "data_source" };
});

/** "Bugün" sayfasını gerçek (mock) depoyla çizer. `operator`: OPERATOR_MODE=local (yönetici) · aksi halde müşteri görünümü. */
async function renderToday(operator: boolean) {
  vi.stubEnv("OPERATOR_MODE", operator ? "local" : "off");
  const element = await TodayPage();
  return render(<TooltipProvider>{element}</TooltipProvider>);
}

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Bugün sayfası (mock veri)", () => {
  it("yönetici görünümü: blok sırası: söz (sayfanın başlığı) → baskın karar → rakamlar → hafta şeridi → sonuçlar bağlantısı", async () => {
    await renderToday(true);
    const voice = screen.getByTestId("today-voice");
    expect(within(voice).getByRole("heading", { level: 1 })).toBeInTheDocument();
    const queue = screen.getByTestId("today-queue");
    const tiles = screen.getByTestId("today-tiles");
    const week = screen.getByTestId("today-week");
    const results = screen.getByRole("link", { name: "Ayrıntılar" });
    for (const [before, after] of [
      [voice, queue],
      [queue, tiles],
      [tiles, week],
      [week, results],
    ] as const) {
      expect(follows(before, after)).toBe(true);
    }
    expect(results).toHaveAttribute("href", "/sonuclar");
    // Soru kutusu sayfadan kalktı: sohbet her sayfada olan yüzen düğmededir.
    expect(screen.queryByTestId("today-ask")).not.toBeInTheDocument();
  });

  it("müşteri görünümü: dört sade blok; maskot sözü, akış şeridi, Sonra listesi ve hafta şeridi yok", async () => {
    await renderToday(false);
    const waiting = screen.getByTestId("ct-waiting");
    const next = screen.getByTestId("ct-next");
    const auto = screen.getByTestId("ct-auto");
    expect(follows(waiting, next)).toBe(true);
    expect(follows(next, auto)).toBe(true);
    expect(within(auto).getByRole("link", { name: "Otomatik işler" })).toHaveAttribute("href", "/otomatik");
    for (const id of ["today-voice", "today-later", "today-week", "today-tiles"]) expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  });

  it("yönetici görünümü: söz karar sayısını söyler; ilk karar baskın blok (TEK dolu düğme orada), kalanı 'Sonra' satırı", async () => {
    await renderToday(true);
    const decisions = [...document.querySelectorAll("[data-decision]")];
    expect(decisions.length).toBeGreaterThan(1);
    expect(screen.getByTestId("today-voice")).toHaveTextContent(`${decisions.length} kararın var.`);
    expect(decisions.map((el) => el.getAttribute("data-lead"))).toEqual(decisions.map((_, index) => (index === 0 ? "true" : "false")));
    expect(decisions[0]).toHaveTextContent(`Karar 1/${decisions.length}`);
    expect(decisions[0]).toHaveTextContent("Sıra sende");
    expect(screen.getByTestId("today-queue").querySelectorAll('[data-emphasis="true"]')).toHaveLength(1);
    expect(screen.getByTestId("today-later").querySelectorAll(":scope > ol > li")).toHaveLength(decisions.length - 1);
  });

  it("eski Özet kartı ve Ayrıntılar bölümü sayfadan kalkmıştır (sayılar, grafikler, tutanlar /sonuclar'dadır); plan haftanın şeridi olarak görünür", async () => {
    const { container } = await renderToday(true);
    expect(screen.queryByTestId("overview-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overview-details")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sayılar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Senden beklediğim")).not.toBeInTheDocument();
    expect(screen.queryByText("Apify maliyeti")).not.toBeInTheDocument();
    const week = screen.getByTestId("today-week");
    expect(week.querySelectorAll("[data-day]")).toHaveLength(7);
    expect(within(week).getByRole("link", { name: "Planı aç" })).toHaveAttribute("href", expect.stringContaining("/bu-hafta"));
    // Cümleli rakamlar: üç karo.
    expect(container.querySelectorAll('[data-testid="today-tiles"] [data-tile]')).toHaveLength(3);
  });

  it("müşteri görünümünde yönetici bilgisi yok: komut, Apify, maliyet, iç sayım, para konuşan kart", async () => {
    const { container } = await renderToday(false);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/npm run/);
    expect(text).not.toMatch(/Apify/);
    expect(text).not.toMatch(/maliyet/i);
    expect(text).not.toMatch(/\d+ analiz, \d+ etiket/);
    expect(container.querySelector('[data-kind="measurement_budget"], [data-kind="review_rivals"]')).toBeNull();
  });

  it("sayfanın kendi metinlerinde jargon yok: güven rozeti, kademe, 'Video 1', ≥ 3x (kayıttan gelen not ve fikir metinleri hariç)", async () => {
    await renderToday(false);
    const clone = document.body.cloneNode(true) as HTMLElement;
    // Not ve fikir başlıkları DB'den gelir (Analist/LLM yazar): söz notu, karar kartı metinleri ve hafta şeridi hariç tutulur.
    clone
      .querySelectorAll(`[data-kind] h2, [data-kind] p, [data-kind] b, [data-kind] small, [data-slot="voice-note"], [data-testid="today-voice"] details, [data-testid="today-week"]`)
      .forEach((el) => el.remove());
    const text = clone.textContent ?? "";
    expect(text).not.toMatch(/Düşük güven|Orta güven|Yüksek güven/);
    expect(text).not.toMatch(/baz çizgisi|kademe|≥ 3x|medyan/i);
    expect(text).not.toMatch(/Video \d|Ölçüm D\+/);
  });

  it("'Haftalık turu başlat' kartı yalnız yönetici modunda VE işler açıkken çıkar (kuyruğun sonunda, iş başlatan düğmeyle)", async () => {
    // İşler kapalı (örnek veri) → yönetici modunda da kart yok.
    const closed = await renderToday(true);
    expect(closed.container.querySelector('[data-kind="run_routine"]')).toBeNull();
    closed.unmount();

    // İşler açık ama müşteri görünümü → kart yok.
    availability.current = { available: true };
    const customer = await renderToday(false);
    expect(customer.container.querySelector('[data-kind="run_routine"]')).toBeNull();
    customer.unmount();

    // İşler açık + yönetici → kart var (örnek veride gelecek haftanın planı yok).
    await renderToday(true);
    const card = document.querySelector<HTMLElement>('[data-kind="run_routine"]')!;
    expect(card).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Haftalık turu başlat" })).toBeEnabled();
    expect(within(card).getByRole("link", { name: "İşler'i aç" })).toHaveAttribute("href", "/isler");
    const decisions = [...document.querySelectorAll("[data-decision]")];
    expect(decisions.at(-1)).toBe(card);
  });

  it("çalışma alanında süren iş varken 'Haftalık turu başlat' kartı çıkmaz ve Demirkazık düşünür", async () => {
    availability.current = { available: true };
    const { repo, wsId } = await getPanelContext();
    const job = await repo.requestJob(wsId, { kind: "analyze" });
    try {
      const { container } = await renderToday(true);
      expect(container.querySelector('[data-kind="run_routine"]')).toBeNull();
      expect(screen.getByTestId("today-voice").querySelector('[data-slot="mascot"]')).toHaveAttribute("data-state", "thinking");
    } finally {
      await repo.cancelJob(wsId, job.id);
    }
  });
});
