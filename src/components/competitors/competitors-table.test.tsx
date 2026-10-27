// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/competitors", () => ({ setCompetitorStatusAction: vi.fn() }));

import { CompetitorsTable } from "@/components/competitors/competitors-table";
import { statusReasonText } from "@/components/competitors/status-reason";
import type { Competitor } from "@/lib/domain/competitor";

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: "cp_1",
    workspaceId: "ws_1",
    platform: "instagram",
    handle: "noelle.kahve",
    displayName: "Noelle",
    followers: 120_000,
    status: "tracked",
    source: "manual",
    missingFields: [],
    contentCount: 10,
    addedAt: "2026-09-01T00:00:00.000Z",
    lastCollectedAt: "2026-09-30T11:05:00.000Z",
    postsPerWeek: 5,
    medianViews: 40_000,
    outlierCount: 2,
    ...overrides,
  };
}

describe("statusReasonText", () => {
  it("ilk harfi büyütür, noktayla bitirir (Türkçe büyük harf)", () => {
    expect(statusReasonText({ statusReason: "hesap gizli" })).toBe("Hesap gizli.");
    expect(statusReasonText({ statusReason: "ilgili hesap bulunamadı." })).toBe("İlgili hesap bulunamadı.");
  });

  it("boş ya da yok → undefined", () => {
    expect(statusReasonText({ statusReason: undefined })).toBeUndefined();
    expect(statusReasonText({ statusReason: "   " })).toBeUndefined();
  });
});

describe("CompetitorsTable", () => {
  it("platform hesap hücresinde; ayrı Platform sütunu yok", () => {
    render(<CompetitorsTable competitors={[competitor()]} timeZone="Europe/Istanbul" />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).not.toContain("Platform");
    const row = screen.getByText("@noelle.kahve").closest("tr") as HTMLElement;
    expect(within(row).getByText("Instagram")).toBeInTheDocument();
  });

  it("rakip profil fotoğrafı (süreli CDN adresi) çizilmez", () => {
    const { container } = render(
      <CompetitorsTable
        competitors={[competitor({ avatarUrl: "https://scontent-xyz.cdninstagram.com/v/t51/avatar.jpg?oe=68F0" })]}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("cdninstagram");
  });

  it("gizli hesap: durum rozetinin yanında sebep Türkçe ve okunur; ölçülemeyen hücreler tire", () => {
    render(
      <CompetitorsTable
        competitors={[
          competitor({
            status: "private",
            statusReason: "hesap gizli",
            followers: undefined,
            medianViews: undefined,
            outlierCount: undefined,
            postsPerWeek: undefined,
            contentCount: 0,
            lastCollectedAt: undefined,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Gizli hesap")).toBeInTheDocument();
    expect(screen.getByTestId("status-reason")).toHaveTextContent("Hesap gizli.");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });

  it("sebebi olmayan satırda sebep satırı çizilmez; son toplama yalnız tarih", () => {
    render(<CompetitorsTable competitors={[competitor()]} timeZone="Europe/Istanbul" />);
    expect(screen.queryByTestId("status-reason")).not.toBeInTheDocument();
    expect(screen.getByText("30 Eyl 2026")).toBeInTheDocument();
  });
});
