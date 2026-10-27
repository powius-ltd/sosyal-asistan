// @vitest-environment jsdom
/**
 * Benzer hesap adımındaki harcama tavanı notu (D1-07): YALNIZ yönetici modunda çizilir; müşteri modunda sayfa ne not ne tutar çizer.
 * Gerçek sayfa (`baslangic/page.tsx`) çağrılır; veri, gizli kapı ve işlemler taklit edilir. Not metnini sayfa kurar, çizimi `RivalsForm` yapar.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ operator: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/workspace/operator-mode", () => ({ isOperatorMode: () => mocks.operator }));
vi.mock("@/app/actions/onboarding", () => ({
  addOnboardingAccountAction: vi.fn(),
  startOnboardingProbeAction: vi.fn(),
  confirmOnboardingAccountAction: vi.fn(),
  startOnboardingBuildAction: vi.fn(),
  addOnboardingRivalAction: vi.fn(),
  discardOnboardingAccountAction: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  getPanelContext: async () => ({
    wsId: "ws",
    repo: {
      listDiscoveryCandidates: async () => [],
      listCompetitors: async () => [],
    },
  }),
}));
vi.mock("@/components/onboarding/onboarding-data", () => ({
  loadOnboardingState: async () => ({
    step: "choose_rivals",
    next: "start_build",
    lowData: false,
    activeJobId: undefined,
    account: { id: "acc-1", platform: "instagram", handle: "ornek.hesap", connection: "scrape_only" },
  }),
}));

import OnboardingPage from "@/app/(panel)/baslangic/page";

async function renderPage() {
  return render(await OnboardingPage({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  process.env.DATA_SOURCE = "mock";
  mocks.operator = false;
});

describe("benzer hesap adımı: harcama tavanı notu", () => {
  it("müşteri modunda hiç çizilmez: not yok, ekranda tutar / tavan / USD geçmez", async () => {
    await renderPage();
    expect(document.querySelector('[data-operator="spend-note"]')).toBeNull();
    expect(document.body).not.toHaveTextContent(/\$|USD|tavan|Yönetici notu/i);
  });

  it("yönetici modunda tutar notu çizilir", async () => {
    mocks.operator = true;
    await renderPage();
    expect(document.querySelector('[data-operator="spend-note"]')).toHaveTextContent(/Yönetici notu: bu adımın harcama tavanı \$0,40/);
  });
});
