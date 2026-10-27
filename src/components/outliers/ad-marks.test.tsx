// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/tutanlar/hooklar",
  useSearchParams: () => new URLSearchParams(""),
}));

import { HookFilters } from "@/components/hooks/hook-filters";
import { HookList } from "@/components/hooks/hook-list";
import { parseHookParams } from "@/components/hooks/search-params";
import { OutlierCard } from "@/components/outliers/outlier-card";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContentItem } from "@/lib/domain/content";
import type { HookLibraryEntry } from "@/lib/domain/hook-library";
import type { OrganicAdMarks } from "@/lib/matrix/ad-organic";

const item = (id: string, kind: "own" | "competitor"): ContentItem =>
  ({
    id,
    platform: "instagram",
    format: "short_video",
    owner: { kind, id: "o", handle: kind === "own" ? "ben" : "rakip", followers: 1000 },
    hashtags: [],
    missingFields: [],
    metrics: {},
    score: { lift: 3, liftTier: 3 },
    hasTranscript: false,
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    workspaceId: "w",
    externalId: id,
  }) as unknown as ContentItem;

const entry = (contentId: string, isOwn: boolean): HookLibraryEntry => ({ contentId, hookText: "Bir açılış.", hookType: "question", ownerHandle: "h", platform: "instagram", isOwn, lift: 3, liftTier: 3 });

const MARKS: OrganicAdMarks = {
  own: { kind: "candidate" },
  used: { kind: "used", signal: "worked", confidence: "high" },
  early: { kind: "used", signal: "unmeasured", confidence: "low" },
};

const wrap = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>);

describe("Tutanlar: reklam rozeti", () => {
  it("kendi videoda 'Reklama uygun' ve reklamdaki durum rozeti çizilir", () => {
    wrap(
      <>
        <OutlierCard item={item("own", "own")} adMark={MARKS.own} />
        <OutlierCard item={item("used", "own")} adMark={MARKS.used} />
        <OutlierCard item={item("early", "own")} adMark={MARKS.early} />
      </>,
    );
    expect(screen.getByText("Reklama uygun")).toBeTruthy();
    expect(screen.getByText("Reklamda da tuttu")).toBeTruthy();
    expect(screen.getByText("Reklamda henüz erken")).toBeTruthy();
  });

  it("rakip videosunda rozet yok (işaret verilmez); müşteri görünümünde (işaret yok) kendi videoda da yok", () => {
    const { container } = wrap(
      <>
        <OutlierCard item={item("rakip", "competitor")} />
        <OutlierCard item={item("own", "own")} />
      </>,
    );
    expect(container.querySelectorAll("[data-ad-signal]")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Reklam/);
  });
});

describe("Açılış kütüphanesi: reklam rozeti ve süzgeci", () => {
  it("yalnız kendi girişte rozet; rakip girişte işaret olsa bile çizilmez", () => {
    const { container } = wrap(<HookList entries={[entry("used", true), entry("rakip", false)]} adMarks={{ ...MARKS, rakip: MARKS.used }} />);
    expect(container.querySelectorAll("[data-ad-signal]")).toHaveLength(1);
    expect(screen.getByText("Reklamda da tuttu")).toBeTruthy();
  });

  it("işaret verilmeyen (müşteri / reklam hesabı yok) listede reklam metni yok", () => {
    const { container } = wrap(<HookList entries={[entry("used", true)]} />);
    expect(container.textContent).not.toMatch(/Reklam/);
  });

  it("'Reklamda denenmiş' süzgeci yalnız adsFilter açıkken çizilir", () => {
    const state = parseHookParams({});
    const off = wrap(<HookFilters state={state} typeOptions={[]} />);
    expect(off.container.textContent).not.toMatch(/Reklamda denenmiş|Reklam/);
    off.unmount();
    wrap(<HookFilters state={state} typeOptions={[]} adsFilter />);
    expect(screen.getByText("Reklam")).toBeTruthy();
  });
});
