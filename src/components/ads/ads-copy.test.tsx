// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/reklamlar",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ads/ad-series-chart", () => ({ AdSeriesChart: () => <div /> }));
const ctx = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/lib/data", () => ({ getPanelContext: async () => ctx.value }));

import AdDetailPage from "@/app/(panel)/reklamlar/[id]/page";
import AdsPage from "@/app/(panel)/reklamlar/page";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { createMockRepository, MOCK_NOW } from "@/test/mock-repo";
import { AD_REASON_PLAIN, AD_VERDICT_PLAIN } from "@/lib/plain-language-ads";
import { PANEL_JARGON } from "@/lib/plain-language";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

/** Ekranda hiç geçmemesi gereken reklam kısaltmaları (kelime sınırında, büyük harfle). */
const AD_JARGON = /\b(ROAS|CPA|CTR|CPM|CPC)\b/i;

afterEach(() => vi.unstubAllEnvs());

/** Düz nesne ağacındaki bütün metinler. */
const stringsOf = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value !== null && typeof value === "object" ? Object.values(value).flatMap(stringsOf) : [];

describe("Reklamlar ekranı düz dil", () => {
  it("sabit metinler, karar adları ve sebep cümleleri jargon taşımaz", () => {
    const copy = stringsOf({ ...AD_SCREEN_COPY, detailStatus: AD_SCREEN_COPY.detail.status, verdicts: AD_VERDICT_PLAIN, reasons: AD_REASON_PLAIN });
    // Sabit komut metni (terminal komutu) ölçü adı değildir; ayıklanır.
    const prose = copy.filter((text) => !text.startsWith("npm run"));
    expect(prose.length).toBeGreaterThan(40);
    for (const text of prose) {
      expect(text, text).not.toMatch(AD_JARGON);
      expect(text, text).not.toMatch(PANEL_JARGON);
    }
  });

  it("çizilmiş liste ve ayrıntı sayfası ROAS / CPA / CTR / CPM içermez", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    const repo = createMockRepository();
    ctx.value = { repo, wsId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) };
    const list = render(await AdsPage({ searchParams: Promise.resolve({}), params: Promise.resolve({}) } as never));
    expect(list.container.textContent ?? "").not.toMatch(AD_JARGON);
    list.unmount();
    for (const account of await repo.listAdAccounts(MOCK_WORKSPACE_ID)) {
      const report = await repo.getAdReport(MOCK_WORKSPACE_ID, { accountId: account.id }, new Date(MOCK_NOW));
      for (const ad of report?.ads ?? []) {
        const view = render(await AdDetailPage({ params: Promise.resolve({ id: ad.ad.id }), searchParams: Promise.resolve({}) } as never));
        expect(view.container.textContent ?? "", ad.ad.name).not.toMatch(AD_JARGON);
        view.unmount();
      }
    }
  });
});
