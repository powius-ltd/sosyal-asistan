// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportPdfLink } from "@/components/report/report-pdf-link";
import { ReportToolbar } from "@/components/report/report-toolbar";
import { WeeklyReportDocument } from "@/components/report/weekly-report-document";
import { makePlan } from "@/components/weekly-plan/test-fixtures";
import { buildWeeklyReport } from "@/lib/report/build-report";
import { REPORT_ROUTES, weeklyReportFor } from "@/lib/routes";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const build = (plan = makePlan()) => buildWeeklyReport({ plan, workspaceName: "Deneme", handle: "deneme", now: NOW });

describe("WeeklyReportDocument", () => {
  it("başlık, hafta aralığı, takvim ve her video çizilir; videolar kendi sayfasında başlar", () => {
    const { container } = render(<WeeklyReportDocument report={build()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Haftalık yol haritası" })).toBeTruthy();
    expect(screen.getByText("Deneme · @deneme · 5 Eki – 11 Eki 2026")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Haftanın takvimi" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(container.querySelectorAll("article.break-before-page")).toHaveLength(3);
    expect(screen.getAllByText("19:00 ET")).toHaveLength(4);
  });

  it("verisi olmayan bölüm hiç çizilmez; ölçülemeyen etki için sayı uydurulmaz", () => {
    const plan = makePlan();
    plan.sections.avoid.entries = [];
    plan.sections.focus.directions = [];
    render(<WeeklyReportDocument report={build(plan)} />);
    for (const heading of ["Neye baktık, ne gördük", "Şimdilik uzak dur", "Geçen hafta nasıl geçti", "Güncel notlar"]) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    }
    // Sonundaki adım hiçbir videoda belli değilse sütun da yok.
    expect(screen.queryByText("Sonundaki adım")).toBeNull();
  });

  it("panel jargonu çizilen metinde yok", () => {
    const { container } = render(<WeeklyReportDocument report={build()} />);
    expect(container.textContent ?? "").not.toMatch(/\blift\b|baz çizgisi|medyan|\bCTA\b|matris|hücre|\bhook\b/i);
  });
});

describe("ReportPdfLink + rota", () => {
  it("rapor sayfasını yeni sekmede açar", () => {
    render(<ReportPdfLink weekStart="2026-10-12" />);
    // İki ekranda tek ad: "PDF olarak kaydet" (yeni sekmede açıldığı ekran okuyucuya söylenir).
    const link = screen.getByRole("link", { name: "PDF olarak kaydet (yeni sekmede açılır)" });
    expect(link.getAttribute("href")).toBe("/rapor/haftalik?hafta=2026-10-12");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("weeklyReportFor: hafta yok ya da biçimsizse parametresiz", () => {
    expect(REPORT_ROUTES.weekly).toBe("/rapor/haftalik");
    expect(weeklyReportFor()).toBe("/rapor/haftalik");
    expect(weeklyReportFor("bozuk")).toBe("/rapor/haftalik");
    expect(weeklyReportFor("2026-10-12")).toBe("/rapor/haftalik?hafta=2026-10-12");
  });
});

describe("ReportToolbar", () => {
  it("planı olan raporda tek düğme 'PDF olarak kaydet' (yazdırma penceresi); plan yoksa düğme çizilmez", () => {
    const { unmount } = render(<ReportToolbar weekStart="2026-10-05" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "PDF olarak kaydet" })).toHaveClass("min-h-tap");
    expect(screen.getByRole("link", { name: "Panele dön" })).toHaveClass("min-h-tap");
    unmount();
    render(<ReportToolbar printable={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
