// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replace, search } = vi.hoisted(() => ({ replace: vi.fn(), search: { current: "" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/tutanlar",
  useSearchParams: () => new URLSearchParams(search.current),
}));

import { OutlierFilters } from "@/components/outliers/outlier-filters";
import { OutlierViewToggle } from "@/components/outliers/outlier-view-toggle";
import { parseOutlierParams } from "@/components/outliers/search-params";

const PLATFORMS = [
  { value: "all", label: "Tüm platformlar" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube (yakında)", disabled: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  search.current = "";
});

describe("OutlierFilters", () => {
  it("anahtar açılınca URL'ye parametre yazar ve cursor'ı sıfırlar", async () => {
    search.current = "cursor=24&sirala=recent";
    const user = userEvent.setup();
    render(<OutlierFilters state={parseOutlierParams({ sirala: "recent", cursor: "24" })} platformOptions={PLATFORMS} />);

    await user.click(screen.getByRole("switch", { name: "Yalnız benim boyumdaki hesaplar" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar?sirala=recent&benzer=1", { scroll: false }));
  });

  it("açık anahtarı kapatınca parametreyi siler", async () => {
    search.current = "benzer=1&guvenilir=1";
    const user = userEvent.setup();
    render(<OutlierFilters state={parseOutlierParams({ benzer: "1", guvenilir: "1" })} platformOptions={PLATFORMS} />);

    const similar = screen.getByRole("switch", { name: "Yalnız benim boyumdaki hesaplar" });
    expect(similar).toBeChecked();
    await user.click(similar);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar?guvenilir=1", { scroll: false }));
  });

  it("seçili filtre değerlerini etiketle gösterir", () => {
    render(<OutlierFilters state={parseOutlierParams({ kademe: "5", gun: "30" })} platformOptions={PLATFORMS} />);
    expect(screen.getByText("5 katı")).toBeInTheDocument();
    expect(screen.getByText("Son 30 gün")).toBeInTheDocument();
  });
});

describe("platform süzgeci", () => {
  it("modülü olmayan platform (YouTube) 'yakında' diye görünür ve seçilemez", async () => {
    const user = userEvent.setup();
    render(<OutlierFilters state={parseOutlierParams({})} platformOptions={PLATFORMS} />);
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    const youtube = await screen.findByRole("option", { name: "YouTube (yakında)" });
    expect(youtube).toHaveAttribute("aria-disabled", "true");
    await user.click(youtube);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("OutlierViewToggle", () => {
  it("tabloya geçince gorunum=table yazar; kartlara dönünce parametreyi siler", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OutlierViewToggle view="cards" />);
    await user.click(screen.getByRole("button", { name: "Tablo görünümü" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tutanlar?gorunum=table", { scroll: false }));

    search.current = "gorunum=table";
    rerender(<OutlierViewToggle view="table" />);
    await user.click(screen.getByRole("button", { name: "Kart görünümü" }));
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/tutanlar", { scroll: false }));
  });
});
