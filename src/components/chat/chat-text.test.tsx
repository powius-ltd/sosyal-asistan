// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatText } from "@/components/chat/chat-text";
import { ROUTES } from "@/lib/routes";

describe("ChatText", () => {
  it("fiş yolunu bağlantıya çevirir, metnin gerisini korur", () => {
    const href = ROUTES.ticket("3f2a-11");
    render(<p><ChatText text={`Fişini yazdım: ${href}. Bakabilirsin.`} /></p>);
    expect(screen.getByRole("link", { name: "fişi aç" })).toHaveAttribute("href", href);
    expect(screen.getByText(/Fişini yazdım:/)).toBeInTheDocument();
  });

  it("yol yoksa düz metin", () => {
    render(<p><ChatText text="Merhaba" /></p>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
