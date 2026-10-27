// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryStrip } from "@/components/ads/summary-strip";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import type { AdReport } from "@/lib/domain/ads";

const report = (sums: AdReport["totals"]["sums"], metrics: AdReport["totals"]["metrics"] = {}): AdReport => ({
  period: { from: "2026-09-03", to: "2026-09-30", days: 28 },
  account: { id: "a", workspaceId: "w", provider: "zernio", externalAccountId: "act_1", currency: "TRY", status: "active" },
  totals: { sums, metrics },
  ads: [],
  unlinkedCount: 0,
});

describe("SummaryStrip", () => {
  it("ölçülemeyen getiri tire + sebep gösterir, 0 yazmaz", () => {
    render(<SummaryStrip report={report({ spend: 1500, impressions: 1000, days: 7 })} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(AD_SCREEN_COPY.strip.returnReason)).toBeInTheDocument();
    expect(screen.getByText(AD_SCREEN_COPY.strip.costReason)).toBeInTheDocument();
    expect(screen.queryByText(/%0|^0$/)).not.toBeInTheDocument();
  });

  it("harcama 0 ise gerçek ölçüm olarak sıfır tutar yazar (tire değil)", () => {
    render(<SummaryStrip report={report({ spend: 0, impressions: 0, days: 3 })} />);
    expect(screen.getByText("₺0,00")).toBeInTheDocument();
  });

  it("ölçülen sonuç ve maliyet hesabın para biriminde çizilir", () => {
    render(<SummaryStrip report={report({ spend: 1000, impressions: 5000, results: 10, resultValue: 3000, days: 7 }, { costPerResult: 100, returnOnSpend: 3 })} />);
    expect(screen.getAllByText(/₺/).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(AD_SCREEN_COPY.strip.costReason)).not.toBeInTheDocument();
  });
});
