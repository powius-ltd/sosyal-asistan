// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DigestPlan, pickCurrentPlan } from "@/components/notifications/digest-plan";
import { WeeklyDigestView } from "@/components/notifications/weekly-digest-view";
import { DEFAULT_ALERT_SETTINGS, type WeeklyDigest } from "@/lib/domain/notification";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";

const TZ = "Europe/Istanbul";

function plan(weekStart: string, over: Partial<WeeklyPlanSummary> = {}): WeeklyPlanSummary {
  return {
    id: `wp_${weekStart}`,
    weekStart,
    status: "ready",
    confidence: "low",
    summary: "Uzun format hiç denenmedi; 60–90 sn videolar rakiplerde tutuyor.",
    plannedCount: 4,
    alternativeCount: 3,
    generatedAt: "2026-09-28T08:00:00.000Z",
    ...over,
  };
}

describe("pickCurrentPlan", () => {
  // 30 Eyl 2026 Çarşamba → haftanın Pazartesi'si 28 Eyl
  const now = new Date("2026-09-30T10:00:00.000Z");

  it("now'ın haftasının planını bulur", () => {
    const found = pickCurrentPlan([plan("2026-09-21"), plan("2026-09-28")], now, TZ);
    expect(found?.weekStart).toBe("2026-09-28");
  });

  it("bu haftanın planı yoksa (yalnız eski plan) undefined", () => {
    expect(pickCurrentPlan([plan("2026-09-21")], now, TZ)).toBeUndefined();
    expect(pickCurrentPlan([], now, TZ)).toBeUndefined();
  });

  it("hafta sınırı workspace saat diliminde: Pazar 23:30 UTC İstanbul'da Pazartesi", () => {
    // 27 Eyl (Paz) 23:30 UTC = 28 Eyl (Pzt) 02:30 İstanbul
    const late = new Date("2026-09-27T23:30:00.000Z");
    expect(pickCurrentPlan([plan("2026-09-28")], late, TZ)?.weekStart).toBe("2026-09-28");
    expect(pickCurrentPlan([plan("2026-09-28")], late, "UTC")).toBeUndefined();
  });
});

describe("DigestPlan", () => {
  it("özet, içerik/aday sayısı, güven ve plana bağlantı (hafta parametreli)", () => {
    render(<DigestPlan plan={plan("2026-09-28")} />);
    expect(screen.getByRole("heading", { name: "Bu haftanın planı" })).toBeInTheDocument();
    expect(screen.getByText("28 Eyl 2026 haftası")).toBeInTheDocument();
    expect(screen.getByText(/Uzun format hiç denenmedi/)).toBeInTheDocument();
    expect(screen.getByText("4 içerik planda, 3 yedek · az örnek, emin değilim")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planı aç" })).toHaveAttribute("href", "/bu-hafta?hafta=2026-09-28");
  });

  it("yedek yoksa ve güven/özet yoksa yalnız sayı; 0 içerik gerçek sayıdır", () => {
    render(<DigestPlan plan={plan("2026-09-28", { alternativeCount: 0, confidence: undefined, summary: undefined, plannedCount: 0 })} />);
    expect(screen.getByText("0 içerik planda")).toBeInTheDocument();
  });

  it("plan yoksa hiçbir şey çizmez", () => {
    const { container } = render(<DigestPlan plan={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WeeklyDigestView plan bölümü", () => {
  const digest: WeeklyDigest = {
    periodStart: "2026-09-22T23:30:00.000Z",
    periodEnd: "2026-09-29T23:30:00.000Z",
    own: { topContent: [] },
    competitors: { newOutliers: [] },
    ideas: { new: 0, scripted: 0 },
    unmeasuredReasons: {},
  };

  it("plan verilirse özet içinde plan bağlantısı; verilmezse bölüm yok", () => {
    const { rerender } = render(<WeeklyDigestView digest={digest} settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} plan={plan("2026-09-28")} />);
    expect(screen.getByRole("link", { name: "Planı aç" })).toBeInTheDocument();
    rerender(<WeeklyDigestView digest={digest} settings={DEFAULT_ALERT_SETTINGS} timeZone={TZ} />);
    expect(screen.queryByRole("link", { name: "Planı aç" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bu haftanın planı" })).not.toBeInTheDocument();
  });
});
