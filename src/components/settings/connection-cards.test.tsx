// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionCards } from "@/components/settings/connection-cards";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OwnAccount } from "@/lib/domain/competitor";

const account = (over: Partial<OwnAccount> = {}): OwnAccount => ({
  id: "oa_1",
  workspaceId: "ws",
  platform: "instagram",
  handle: "ornek",
  connection: "connected",
  scopes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("ConnectionCards (D3-18)", () => {
  it("bağlı hesapta düğme 'Yeniden bağla'; devre dışı ve nedeni görünür yazılı", () => {
    wrap(<ConnectionCards accounts={[account()]} timeZone="Europe/Istanbul" />);
    const button = screen.getByRole("button", { name: "Yeniden bağla" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Bağlantı yakında açılacak/);
  });

  it("bağlı hesap yoksa düğme 'Bağla'", () => {
    wrap(<ConnectionCards accounts={[account({ connection: "scrape_only" })]} timeZone="Europe/Istanbul" />);
    expect(screen.getByRole("button", { name: "Bağla" })).toBeDisabled();
  });

  it("müşteri 'Faz' yazısı görmez, yönetici görür", () => {
    const { container, unmount } = wrap(<ConnectionCards accounts={[]} timeZone="Europe/Istanbul" />);
    expect(container.textContent).not.toMatch(/Faz \d|OAuth/);
    expect(container.textContent).toMatch(/TikTok bağlantısı yakında/);
    unmount();
    const operator = wrap(<ConnectionCards accounts={[]} timeZone="Europe/Istanbul" operator />);
    expect(operator.container.textContent).toMatch(/Faz 4/);
  });
});
