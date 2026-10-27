// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { WeeklyPlanCard } from "@/components/overview/weekly-plan-card";
import { makePlan } from "@/components/weekly-plan/test-fixtures";
import { planItemStatuses } from "@/lib/overview/plan-item-status";

const items = () => within(screen.getByRole("list", { name: "Planın ilk içerikleri" })).getAllByRole("listitem");

describe("WeeklyPlanCard", () => {
  it("ilk 3 içeriği durumu ve slot zamanıyla listeler; sıradaki çekim vurgulu; tek birincil düğme plana hafta parametresiyle bağlanır", () => {
    render(<WeeklyPlanCard plan={makePlan()} currentWeekStart="2026-10-05" />);
    expect(items()).toHaveLength(3);
    expect(items()[0]).toHaveTextContent("Fikir 1");
    expect(items()[0]).toHaveTextContent("Sırada");
    expect(items()[0]).toHaveTextContent("Per 19:00 ET");
    expect(items()[0]).toHaveTextContent("Cum 02:00 İstanbul");
    expect(items()[0]).toHaveAttribute("data-status", "next");
    expect(items()[1]).toHaveTextContent("Çekilecek");
    expect(items()[1]).toHaveAttribute("data-status", "to_shoot");
    expect(screen.queryByText("Fikir 4")).not.toBeInTheDocument();
    const open = screen.getByRole("link", { name: /Planı aç/ });
    expect(open).toHaveAttribute("href", "/bu-hafta?hafta=2026-10-05");
    expect(open).toHaveTextContent("+1 içerik");
    expect(screen.getAllByRole("link", { name: /Planı aç/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Neden bu plan?" })).toHaveAttribute("href", "/bu-hafta?hafta=2026-10-05#focus");
    expect(screen.queryByText(/henüz üretilmedi/)).not.toBeInTheDocument();
  });

  it("madde satırı fikir kartına bağlanır", () => {
    render(<WeeklyPlanCard plan={makePlan()} currentWeekStart="2026-10-05" />);
    expect(within(items()[0]).getByRole("link", { name: "Fikir 1" })).toHaveAttribute("href", "/fikirler?id=idea-1");
  });

  it("yayınlanan, sonucu bekleyen ve sonucu gelen maddeleri düz dille gösterir", () => {
    const plan = makePlan();
    plan.items[0].idea = { ...plan.items[0].idea, status: "published" };
    const statuses = planItemStatuses(plan, undefined, "2026-10-05");
    statuses[1] = { kind: "awaiting_result", waitingDay: 3 };
    statuses[2] = { kind: "result", resultPhrase: "normalinin 2,3 katı izlendi", strongResult: false };
    render(<WeeklyPlanCard plan={plan} statuses={statuses} currentWeekStart="2026-10-05" />);
    expect(items()[0]).toHaveTextContent("Yayınlandı");
    expect(items()[0]).not.toHaveTextContent("Per 19:00");
    expect(items()[1]).toHaveTextContent("Sonucu bekleniyor");
    expect(items()[1]).toHaveTextContent("3. gün sonucu");
    expect(items()[2]).toHaveTextContent("Sonuç geldi");
    expect(items()[2]).toHaveTextContent("Videon normalinin 2,3 katı izlendi.");
  });

  it("plan önceki haftaysa bunu söyler ve sıra vurgusu yapmaz", () => {
    render(<WeeklyPlanCard plan={makePlan()} currentWeekStart="2026-10-12" />);
    expect(screen.getByText(/bu hafta için plan henüz üretilmedi/)).toBeInTheDocument();
    expect(items()[0]).toHaveAttribute("data-status", "not_shot");
    expect(screen.queryByText("Sırada")).not.toBeInTheDocument();
  });

  it("plan yoksa kısa boş durum gösterir; müşteriye ne komut ne iş düğmesi", () => {
    render(<WeeklyPlanCard plan={null} />);
    expect(screen.getByText("Henüz plan yok")).toBeInTheDocument();
    expect(screen.getByText(/Plan hazır olunca burada göreceksin/)).toBeInTheDocument();
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Planı aç/ })).not.toBeInTheDocument();
  });

  it("plan yokken yönetici modunda 'Planı hazırla' iş düğmesi görünür (komut metni yok)", () => {
    render(<WeeklyPlanCard plan={null} operator />);
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toHaveAttribute("data-kind", "plan");
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
  });

  it("plan varken ya da okunamadıysa iş düğmesi çizilmez", () => {
    const { unmount } = render(<WeeklyPlanCard plan={makePlan()} operator />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    render(<WeeklyPlanCard plan={undefined} operator />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("plan okunamadıysa çökmez, 'okuyamadım' der", () => {
    render(<WeeklyPlanCard plan={undefined} />);
    expect(screen.getByText("Planı şu an okuyamadım.")).toBeInTheDocument();
    expect(screen.queryByText("Henüz plan yok")).not.toBeInTheDocument();
  });

  it("slotu atanmamış içerikte saat tire olur", () => {
    const plan = makePlan();
    plan.items = [{ ...plan.items[0], slotAt: undefined }];
    render(<WeeklyPlanCard plan={plan} />);
    expect(within(items()[0]).getByText("—")).toBeInTheDocument();
  });
});
