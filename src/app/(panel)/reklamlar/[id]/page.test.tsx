// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/reklamlar/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ads/ad-series-chart", () => ({ AdSeriesChart: ({ points }: { points: unknown[] }) => <div data-testid="series">{points.length} gün</div> }));
const ctx = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/lib/data", () => ({ getPanelContext: async () => ctx.value }));

import AdDetailPage from "@/app/(panel)/reklamlar/[id]/page";
import { createMockRepository, MOCK_NOW } from "@/test/mock-repo";
import { AD_SCREEN_COPY } from "@/lib/copy/ads";
import { MOCK_WORKSPACE_ID } from "@/lib/workspace/current";

const props = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }) as never;
const setup = async () => {
  const repo = createMockRepository();
  ctx.value = { repo, wsId: MOCK_WORKSPACE_ID, now: new Date(MOCK_NOW) };
  const report = await repo.getAdReport(MOCK_WORKSPACE_ID, {}, new Date(MOCK_NOW));
  return report?.ads[0];
};

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("/reklamlar/[id] müşteri kopyasında", () => {
  it("yönetici modu açık olsa da notFound", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    vi.stubEnv("PANEL_EDITION", "kopya");
    await expect(AdDetailPage(props("x"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("/reklamlar/[id]", () => {
  it("ayrıntıyı çizer: öneri, nedenler, günlük seri, bağlı içerik", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    const target = await setup();
    const { container } = render(await AdDetailPage(props(target?.ad.id ?? "")));
    expect(screen.getByRole("heading", { name: target?.ad.name ?? "" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="ad-verdict"]')).not.toBeNull();
    expect(screen.getByText(AD_SCREEN_COPY.detail.why)).toBeInTheDocument();
    expect(screen.getByTestId("series")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="ad-content"]')).not.toBeNull();
  });

  it("bilinmeyen kimlikte notFound", async () => {
    vi.stubEnv("OPERATOR_MODE", "local");
    await setup();
    await expect(AdDetailPage(props("ad900000-0000-4000-8000-000000000000"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("yönetici modu kapalıyken notFound ve depoya dokunulmaz", async () => {
    vi.stubEnv("OPERATOR_MODE", "off");
    const getAdDetail = vi.fn();
    ctx.value = { repo: { getAdDetail }, wsId: "w", now: new Date() };
    await expect(AdDetailPage(props("x"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAdDetail).not.toHaveBeenCalled();
  });
});
