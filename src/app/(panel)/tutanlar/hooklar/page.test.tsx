// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tutanlar/hooklar",
  useSearchParams: () => new URLSearchParams(),
}));
const ctx = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/lib/data", () => ({ getPanelContext: async () => ctx.value }));
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import HookLibraryPage from "@/app/(panel)/tutanlar/hooklar/page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";
import { createMockRepository, MOCK_NOW } from "@/test/mock-repo";

const props = (search: Record<string, string> = {}) => ({ searchParams: Promise.resolve(search), params: Promise.resolve({}) }) as never;
const html = async (repo: unknown, search: Record<string, string> = {}): Promise<string> => {
  ctx.value = { repo, wsId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) };
  const { container, unmount } = render(<TooltipProvider>{await HookLibraryPage(props(search))}</TooltipProvider>);
  // React'in üretilen kimlikleri (`useId`) render sayısına göre değişir; karşılaştırma için normalize edilir.
  const out = container.innerHTML.replace(/_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»/g, "ID");
  unmount();
  return out;
};

afterEach(() => vi.unstubAllEnvs());

describe("/tutanlar/hooklar · reklam işareti", () => {
  it("yönetici modunda ve reklam hesabı varken kendi açılışta rozet çıkar; süzgeç çizilir", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    const out = await html(createMockRepository(), { reklam: "1" });
    expect(out).toContain("Reklamda da tuttu");
    expect(out).toContain("Reklamda denenmiş");
  });

  it("müşteri görünümünde (OPERATOR_MODE=off) reklam rozeti ve süzgeci yok", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    const out = await html(createMockRepository());
    expect(out).not.toMatch(/Reklam/);
  });

  it("reklam hesabı olmayan çalışma alanında çıktı müşteri görünümüyle aynı: rozet ve süzgeç yok", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    const repo = { ...createMockRepository(), listAdAccounts: async () => [] };
    const withoutAccount = await html(repo);
    expect(withoutAccount).not.toMatch(/Reklam/);
    vi.stubEnv("OPERATOR_MODE", "off");
    expect(await html(createMockRepository())).toBe(withoutAccount);
  });
});
