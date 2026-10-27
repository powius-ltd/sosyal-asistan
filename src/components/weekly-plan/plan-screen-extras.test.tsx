// @vitest-environment jsdom
/** Bu hafta ekranının ek kuralları: dokunma hedefi (D2-13), "PDF olarak kaydet" adı (D2-14), plansız hafta metni (D2-14). */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { ReportPdfLink } from "@/components/report/report-pdf-link";
import { PlanEmptyState } from "@/components/weekly-plan/plan-empty-state";
import { WeekPicker } from "@/components/weekly-plan/week-picker";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";

afterEach(() => vi.unstubAllEnvs());

describe("dokunma hedefleri", () => {
  it("hafta çipleri ve PDF bağlantısı dar ekranda min-h-tap, md+ ta ince", () => {
    const plans = [{ id: "p1", weekStart: "2026-10-05" }, { id: "p2", weekStart: "2026-09-28" }] as WeeklyPlanSummary[];
    render(<WeekPicker plans={plans} selected="2026-10-05" />);
    for (const chip of screen.getAllByRole("link")) expect(chip).toHaveClass("min-h-tap", "md:min-h-0");
    render(<ReportPdfLink weekStart="2026-10-05" />);
    expect(screen.getByRole("link", { name: /PDF olarak kaydet/ })).toHaveClass("min-h-tap", "md:min-h-0");
  });
});

describe("plansız hafta", () => {
  it("müşteri görünümünde sıradaki adımı söyler (kim hazırlıyor, nerede görünür); düğme ve komut yok", () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    render(<PlanEmptyState requestedWeek="2026-10-12" hasOtherPlans={false} />);
    expect(screen.getByText("Planı yöneticin hazırlar; hazır olunca bu sayfada görünür ve PDF olarak kaydedebilirsin.")).toBeInTheDocument();
    expect(screen.queryByText("Bu haftanın planı hazırlanınca burada görünür.")).not.toBeInTheDocument();
  });

  it("yönetici görünümünde planı kendisi hazırlar (müşteri cümlesi yok)", () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    render(<PlanEmptyState hasOtherPlans={false} />);
    expect(screen.getByText("Planı hazırlayınca burada görünür.")).toBeInTheDocument();
    expect(screen.queryByText(/yöneticin hazırlar/)).not.toBeInTheDocument();
  });
});
