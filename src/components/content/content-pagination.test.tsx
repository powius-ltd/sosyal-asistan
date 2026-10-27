// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentPagination } from "@/components/content/content-pagination";
import type { ContentQuery } from "@/components/content/content-query";
import { linkButtonClass } from "@/components/content/link-button";

const first: ContentQuery = { sort: "tarih", history: [] };

describe("ContentPagination", () => {
  it("tek sayfada hiçbir şey çizmez", () => {
    const { container } = render(<ContentPagination query={first} shown={2} total={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ilk sayfada yalnız Sonraki bağlantı olur ve aralığı yazar", () => {
    render(<ContentPagination query={first} shown={25} total={60} nextCursor="25" />);
    expect(screen.getByText("1–25 / 60")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sonraki" })).toHaveAttribute("href", "/icerikler?imlec=25");
    expect(screen.queryByRole("link", { name: "Önceki" })).not.toBeInTheDocument();
    expect(screen.getByText("Önceki")).toHaveAttribute("aria-disabled", "true");
  });

  it("ikinci sayfada Önceki ilk sayfaya döner, filtreler korunur", () => {
    const second: ContentQuery = { sort: "lift", days: 30, cursor: "25", history: [] };
    render(<ContentPagination query={second} shown={25} total={60} nextCursor="50" />);
    expect(screen.getByText("26–50 / 60")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önceki" })).toHaveAttribute("href", "/icerikler?gun=30&sirala=lift");
    expect(screen.getByRole("link", { name: "Sonraki" })).toHaveAttribute(
      "href",
      "/icerikler?gun=30&sirala=lift&imlec=50&gecmis=25",
    );
  });
});

describe("linkButtonClass", () => {
  it("outline'da kenarlığı gizleyen border-transparent sınıfını bırakmaz", () => {
    const classes = linkButtonClass("outline").split(" ");
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-transparent");
  });
});
