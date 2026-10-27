// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/reklamlar",
  useSearchParams: () => new URLSearchParams(),
}));
const ctx = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/lib/data", () => ({ getPanelContext: async () => ctx.value }));

import AdsPage from "@/app/(panel)/reklamlar/page";
import { createMockRepository, MOCK_NOW } from "@/test/mock-repo";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { AD_EMPTY_PLAIN } from "@/lib/plain-language-ads";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const setup = (repo: unknown = createMockRepository()) => {
  ctx.value = { repo, wsId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) };
};
const props = (search: Record<string, string> = {}) => ({ searchParams: Promise.resolve(search), params: Promise.resolve({}) }) as never;

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("/reklamlar müşteri kopyasında", () => {
  it("yönetici modu açık olsa da notFound", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("PANEL_EDITION", "kopya");
    setup();
    await expect(AdsPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("/reklamlar", () => {
  it("hesap yokken düz dille 'reklam hesabı bağlı değil' der ve bağlama komutunu yöneticiye gösterir", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    setup({ ...createMockRepository(), listAdAccounts: async () => [], listJobs: async () => [], getAdReport: vi.fn() });
    render(await AdsPage(props()));
    expect(screen.getByText(AD_EMPTY_PLAIN.title)).toBeInTheDocument();
    expect(screen.getByText(AD_SCREEN_COPY.admin.linkCommand)).toBeInTheDocument();
  });

  it("örnek veriyle şeridi, öneri gruplarını ve hedef bölümünü çizer; güncelleme düğmesi yok, komut düz metin", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    setup();
    const { container } = render(await AdsPage(props()));
    const strip = container.querySelector('[data-slot="ad-summary"]') as HTMLElement;
    expect(within(strip).getByText(AD_SCREEN_COPY.strip.spend)).toBeInTheDocument();
    expect(within(strip).getByText(AD_SCREEN_COPY.strip.costPerResult)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="ad-row"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-slot="ad-goal"]')).not.toBeNull();
    expect(screen.getByText(AD_SCREEN_COPY.admin.syncCommand)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /güncelle|yenile|eşitle/i })).not.toBeInTheDocument();
  });

  it("hedefsiz hesapta reklamlar 'karar verilemedi' grubuna girer", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    const repo = createMockRepository();
    const accounts = await repo.listAdAccounts(MOCK_WORKSPACE_ID);
    const goalless = accounts.find((account) => account.goal === undefined);
    expect(goalless).toBeDefined();
    setup(repo);
    const { container } = render(await AdsPage(props({ hesap: goalless?.id ?? "" })));
    expect(container.querySelector('[data-slot="ad-group-undecided"]')).not.toBeNull();
    expect(screen.getByText(AD_SCREEN_COPY.groups.undecided.title, { exact: false })).toBeInTheDocument();
  });

  it("yönetici modu kapalıyken sayfa yok (404) ve depoya dokunulmaz", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    const listAdAccounts = vi.fn();
    setup({ listAdAccounts });
    await expect(AdsPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAdAccounts).not.toHaveBeenCalled();
  });
});
