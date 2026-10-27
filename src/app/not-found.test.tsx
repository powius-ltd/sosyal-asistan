// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VideoNotFound from "@/app/(panel)/video/[id]/not-found";
import PanelNotFound from "@/app/(panel)/not-found";
import RootNotFound from "@/app/not-found";

describe("Türkçe 404 sayfaları (D2-11)", () => {
  it("bilinmeyen video: Türkçe başlık, Bugün'e dön ve İçeriklerim bağlantıları (48 px)", () => {
    render(<VideoNotFound />);
    expect(screen.getByText("Bu video bulunamadı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bugün'e dön" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Bugün'e dön" })).toHaveClass("min-h-tap");
    expect(screen.getByRole("link", { name: "İçeriklerim" })).toHaveAttribute("href", "/icerikler");
    expect(document.body.textContent).not.toMatch(/This page could not be found|404/);
  });

  it("panel ve kök 404'ü de Türkçe", () => {
    const { unmount } = render(<PanelNotFound />);
    expect(screen.getByText("Bu sayfa bulunamadı")).toBeInTheDocument();
    unmount();
    render(<RootNotFound />);
    expect(screen.getByText("Bu sayfa bulunamadı")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bugün'e dön" })).toBeInTheDocument();
  });
});
