// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replace, search } = vi.hoisted(() => ({ replace: vi.fn(), search: { current: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/tutanlar/hooklar",
  useSearchParams: () => new URLSearchParams(search.current),
}));

import { HookFilters } from "@/components/hooks/hook-filters";
import { HookList } from "@/components/hooks/hook-list";
import { HookPagination } from "@/components/hooks/hook-pagination";
import { HookTypeStats } from "@/components/hooks/hook-type-stats";
import { parseHookParams } from "@/components/hooks/search-params";
import type { HookLibraryEntry, HookTypeStat } from "@/lib/domain/hook-library";

const TYPE_OPTIONS = [
  { value: "question", label: "Soru" },
  { value: "shock_stat", label: "Şok istatistik" },
];

function entry(overrides: Partial<HookLibraryEntry> = {}): HookLibraryEntry {
  return {
    contentId: "ci_010",
    hookText: "Sabah kahveni yanlış içiyorsun.",
    hookType: "mistake_warning",
    ownerHandle: "kahvecininyeri",
    platform: "instagram",
    isOwn: false,
    lift: 4.2,
    liftTier: 3,
    publishedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  search.current = "";
});

describe("HookList", () => {
  it("hook metnini tırnak içinde birebir, tür/hesap/kendi-rakip/lift/tarih ve video bağlantısıyla gösterir", () => {
    render(<HookList entries={[entry()]} timeZone="Europe/Istanbul" />);
    expect(screen.getByText("“Sabah kahveni yanlış içiyorsun.”")).toBeInTheDocument();
    expect(screen.getByText("Hata uyarısı")).toBeInTheDocument();
    expect(screen.getByText("@kahvecininyeri")).toBeInTheDocument();
    expect(screen.getByText("Rakip")).toBeInTheDocument();
    expect(screen.getByText("4,2x")).toBeInTheDocument();
    expect(screen.getByText("10 Eyl 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Video analizi" })).toHaveAttribute("href", "/video/ci_010");
    expect(screen.getByRole("button", { name: "Açılış cümlesini kopyala" })).toBeInTheDocument();
  });

  it("kendi hesap 'Kendi' rozeti alır", () => {
    render(<HookList entries={[entry({ isOwn: true })]} />);
    expect(screen.getByText("Kendi")).toBeInTheDocument();
  });

  it("ölçülemeyen lift ve bilinmeyen tarih '—' gösterir, 0 değil", () => {
    render(<HookList entries={[entry({ lift: undefined, liftTier: undefined, publishedAt: undefined })]} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0x")).not.toBeInTheDocument();
  });
});

describe("HookTypeStats", () => {
  const stats: HookTypeStat[] = [
    { hookType: "question", count: 12, medianLift: 3.4 },
    { hookType: "list", count: 6, medianLift: undefined },
  ];

  it("tür etiketi, adet ve medyan lift; ölçülemeyen medyan '—'", () => {
    render(<HookTypeStats stats={stats} state={parseHookParams({})} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Soru")).toBeInTheDocument();
    expect(within(rows[0]).getByText("12")).toBeInTheDocument();
    expect(within(rows[0]).getByText("3,4x")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Liste")).toBeInTheDocument();
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();
  });

  it("satır o türe süzen bağlantıdır; diğer süzgeçler korunur; seçili türe tıklamak süzgeci kaldırır", () => {
    const state = parseHookParams({ q: "kahve", kaynak: "rakip" });
    const { rerender } = render(<HookTypeStats stats={stats} state={state} />);
    const href = screen.getAllByRole("link")[0].getAttribute("href")!;
    expect(Object.fromEntries(new URL(href, "http://x").searchParams)).toEqual({ tur: "question", q: "kahve", kaynak: "rakip" });

    rerender(<HookTypeStats stats={stats} state={parseHookParams({ tur: "question", q: "kahve" })} />);
    const active = screen.getAllByRole("link")[0];
    expect(active).toHaveAttribute("aria-current", "true");
    expect(active.getAttribute("href")).toBe("/tutanlar/hooklar?q=kahve");
  });
});

describe("HookFilters", () => {
  it("arama gönderilince q yazılır ve cursor sıfırlanır", async () => {
    search.current = "cursor=20&sirala=yeni";
    const user = userEvent.setup();
    render(<HookFilters state={parseHookParams({ cursor: "20", sirala: "yeni" })} typeOptions={TYPE_OPTIONS} />);

    await user.type(screen.getByLabelText("Ara"), "kahve{Enter}");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar/hooklar?sirala=yeni&q=kahve", { scroll: false }));
  });

  it("boş aramayı gönderince q parametresi silinir", async () => {
    search.current = "q=kahve";
    const user = userEvent.setup();
    render(<HookFilters state={parseHookParams({ q: "kahve" })} typeOptions={TYPE_OPTIONS} />);

    await user.clear(screen.getByLabelText("Ara"));
    await user.click(screen.getByRole("button", { name: "Ara" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar/hooklar", { scroll: false }));
  });

  it("seçili filtre değerlerini etiketle gösterir", () => {
    render(
      <HookFilters
        state={parseHookParams({ tur: "shock_stat", kademe: "3", kaynak: "kendi", sirala: "yeni" })}
        typeOptions={TYPE_OPTIONS}
      />,
    );
    expect(screen.getByText("Şok istatistik")).toBeInTheDocument();
    expect(screen.getByText("3 katı")).toBeInTheDocument();
    expect(screen.getByText("Yalnız kendi")).toBeInTheDocument();
    expect(screen.getByText("En yeni")).toBeInTheDocument();
  });

  it("kademe seçilince URL'ye lift eşiği yazılır", async () => {
    const user = userEvent.setup();
    render(<HookFilters state={parseHookParams({})} typeOptions={TYPE_OPTIONS} />);

    await user.click(screen.getByRole("combobox", { name: "Normalinin en az" }));
    await user.click(await screen.findByRole("option", { name: "5 katı" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar/hooklar?kademe=5", { scroll: false }));
  });

  it("süzgeç açıkken 'Filtreleri temizle' bağlantısı gösterilir, kapalıyken gösterilmez", () => {
    const { rerender } = render(<HookFilters state={parseHookParams({})} typeOptions={TYPE_OPTIONS} />);
    expect(screen.queryByRole("link", { name: "Filtreleri temizle" })).not.toBeInTheDocument();

    rerender(<HookFilters state={parseHookParams({ q: "x", sirala: "yeni" })} typeOptions={TYPE_OPTIONS} />);
    expect(screen.getByRole("link", { name: "Filtreleri temizle" })).toHaveAttribute("href", "/tutanlar/hooklar?sirala=yeni");
  });
});

describe("HookPagination", () => {
  it("ilk sayfada ve sonraki yoksa hiçbir şey çizmez", () => {
    const { container } = render(<HookPagination state={parseHookParams({})} shown={5} total={5} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sonraki sayfa bağlantısı süzgeçleri korur ve imleci taşır; ikinci sayfada 'Önceki sayfa' ilk sayfaya, üçüncüde bir öncekine döner", () => {
    const { rerender } = render(<HookPagination state={parseHookParams({ tur: "list", q: "a" })} shown={20} total={45} nextCursor="c2" />);
    const next = screen.getByRole("link", { name: /Sonraki sayfa/ }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(next, "http://x").searchParams)).toEqual({ tur: "list", q: "a", cursor: "c2" });
    expect(screen.getByText("Toplam 45 açılış cümlesi · bu sayfada 20")).toBeInTheDocument();

    rerender(<HookPagination state={parseHookParams({ tur: "list", q: "a", cursor: "c2" })} shown={20} total={45} />);
    const previous = screen.getByRole("link", { name: /Önceki sayfa/ }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(previous, "http://x").searchParams)).toEqual({ tur: "list", q: "a" });
    // İkinci sayfada "İlk sayfa" ile "Önceki sayfa" aynı yere gider: yalnız "Önceki sayfa" çizilir.
    expect(screen.queryByRole("link", { name: /İlk sayfa/ })).not.toBeInTheDocument();

    rerender(<HookPagination state={parseHookParams({ tur: "list", q: "a", cursor: "c3", onceki: ["c2"] })} shown={5} total={45} />);
    const back = screen.getByRole("link", { name: /Önceki sayfa/ }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(back, "http://x").searchParams)).toEqual({ tur: "list", q: "a", cursor: "c2" });
    const first = screen.getByRole("link", { name: /İlk sayfa/ }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(first, "http://x").searchParams)).toEqual({ tur: "list", q: "a" });
  });
});
