// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ContentEmbed } from "@/components/video/content-embed";
import { getPlatformModule } from "@/lib/platforms/registry";

describe("ContentEmbed (platformdan bağımsız resmi oynatıcı)", () => {
  const instagram = getPlatformModule("instagram");
  const embedUrl = instagram.embedUrl("https://www.instagram.com/reel/DAbCdEfGhIj/");
  const play = { name: "Instagram oynatıcısında aç" };

  it("ilk görünümde yalnız düğme var; iframe ve görsel DOM'da yok", () => {
    const { container } = render(<ContentEmbed embedUrl={embedUrl} platformLabel={instagram.label} title="@noelle videosu" />);
    expect(screen.getByRole("button", play)).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("tıklayınca yalnız resmi embed adresiyle iframe yüklenir", async () => {
    const user = userEvent.setup();
    const { container } = render(<ContentEmbed embedUrl={embedUrl} platformLabel={instagram.label} title="@noelle videosu" />);
    await user.click(screen.getByRole("button", play));
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute("src", "https://www.instagram.com/reel/DAbCdEfGhIj/embed/");
    expect(frame).toHaveAttribute("title", "@noelle videosu");
    expect(screen.queryByRole("button", play)).not.toBeInTheDocument();
  });

  it("CDN adresi ya da adressiz içerik: düğme ve iframe yok, sebep yazılı", () => {
    const cdn = "https://scontent-xyz.cdninstagram.com/v/t51.2885-15/abc.jpg?oe=68F0";
    const { container, rerender } = render(<ContentEmbed embedUrl={instagram.embedUrl(cdn)} platformLabel={instagram.label} title="x" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).not.toContain("cdninstagram");
    expect(screen.getByText(/gömülü oynatıcı yok/)).toBeInTheDocument();

    rerender(<ContentEmbed embedUrl={undefined} platformLabel={instagram.label} title="x" />);
    expect(screen.getByText(/gömülü oynatıcı yok/)).toBeInTheDocument();
  });

  it("platform adı etiketten gelir (bileşen platforma dallanmaz)", () => {
    render(<ContentEmbed embedUrl="https://ornek.test/embed/1" platformLabel="Başka Platform" title="x" />);
    expect(screen.getByRole("button", { name: "Başka Platform oynatıcısında aç" })).toBeInTheDocument();
  });
});
