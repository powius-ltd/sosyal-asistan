// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentFilters } from "@/components/content/content-filters";
import type { ContentQuery } from "@/components/content/content-query";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const accountOptions = [
  { value: "oa_1", label: "@bahcekafe.ist · Instagram" },
  { value: "oa_2", label: "@bahcekafe · TikTok" },
];

beforeEach(() => push.mockClear());

describe("ContentFilters", () => {
  it("seçili değerleri gösterir; filtre yokken 'Filtreleri temizle' çıkmaz", () => {
    const query: ContentQuery = { sort: "tarih", history: [] };
    render(<ContentFilters query={query} accountOptions={accountOptions} />);
    expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveTextContent("Tüm hesaplar");
    expect(screen.getByRole("combobox", { name: "Sıralama" })).toHaveTextContent("En yeni");
    expect(screen.queryByRole("link", { name: "Filtreleri temizle" })).not.toBeInTheDocument();
  });

  it("dar ekranda tüm süzgeçler ve 'Filtreleri temizle' ≥ 48 px dokunma hedefidir (D2-13)", () => {
    const query: ContentQuery = { account: "oa_2", sort: "tarih", history: [] };
    render(<ContentFilters query={query} accountOptions={accountOptions} />);
    for (const name of ["Hesap", "Format", "Tarih aralığı", "Sıralama"]) {
      expect(screen.getByRole("combobox", { name })).toHaveClass("min-h-tap");
    }
    expect(screen.getByRole("link", { name: "Filtreleri temizle" })).toHaveClass("min-h-tap");
  });

  it("format seçilince URL'yi günceller ve sayfalamayı sıfırlar", async () => {
    const user = userEvent.setup();
    const query: ContentQuery = { sort: "lift", days: 30, cursor: "25", history: ["x"] };
    render(<ContentFilters query={query} accountOptions={accountOptions} />);

    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(await screen.findByRole("option", { name: "Karusel" }));

    expect(push).toHaveBeenCalledWith("/icerikler?format=carousel&gun=30&sirala=lift");
  });

  it("'Tüm hesaplar' seçilince hesap filtresi kalkar", async () => {
    const user = userEvent.setup();
    const query: ContentQuery = { account: "oa_2", sort: "tarih", history: [] };
    render(<ContentFilters query={query} accountOptions={accountOptions} />);
    expect(screen.getByRole("combobox", { name: "Hesap" })).toHaveTextContent("@bahcekafe · TikTok");

    await user.click(screen.getByRole("combobox", { name: "Hesap" }));
    await user.click(await screen.findByRole("option", { name: "Tüm hesaplar" }));

    expect(push).toHaveBeenCalledWith("/icerikler");
    expect(screen.getByRole("link", { name: "Filtreleri temizle" })).toHaveAttribute("href", "/icerikler");
  });
});
