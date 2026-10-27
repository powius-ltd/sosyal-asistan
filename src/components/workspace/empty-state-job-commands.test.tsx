// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Boş çalışma alanının deposu: fikir de hook da yok (gerçek ve örnek veride bu iki boş durum oluşmaz; yalnız burada çizilir).
vi.mock("@/lib/data", async () => {
  const { IDEA_STATUSES } = await import("@/lib/domain/intel");
  const repo = {
    countIdeasByStatus: async () => Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])),
    listIdeas: async () => [],
    listIdeaLinks: async () => [],
    getWorkspace: async () => undefined,
    listAdAccounts: async () => [],
    listHookLibrary: async () => ({ items: [], total: 0 }),
    hookTypeStats: async () => [],
  };
  return { getPanelContext: async () => ({ repo, wsId: "ws_bos", now: new Date("2026-10-05T09:00:00.000Z") }) };
});
// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import IdeasPage from "@/app/(panel)/fikirler/page";
import HookLibraryPage from "@/app/(panel)/tutanlar/hooklar/page";

describe("boş durumdaki iş düğmeleri (komut metni yerine)", () => {
  it("Fikirler: hiç fikir yokken 'Planı hazırla' işi; ekranda komut adı yok", async () => {
    const { container } = render(await IdeasPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Henüz fikir yok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Planı hazırla" })).toHaveAttribute("data-kind", "plan");
    expect(container).not.toHaveTextContent(/plan:week|npm run/);
  });

  it("Açılış kütüphanesi: boşken 'Videoları incele' işi; bilgi satırında ve boş durumda komut adı yok", async () => {
    const { container } = render(await HookLibraryPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Henüz açılış cümlesi yok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Videoları incele" })).toHaveAttribute("data-kind", "analyze");
    expect(container).not.toHaveTextContent(/analyze:now|npm run/);
  });
});
